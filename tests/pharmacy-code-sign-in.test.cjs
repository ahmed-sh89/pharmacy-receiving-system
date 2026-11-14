const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { parseHTML } = require('linkedom');

const source = stripTypeScriptTypes(
    fs.readFileSync('supabase/functions/pharmflow-code-sign-in/index.ts', 'utf8').replace(/^import .*\n/gm, '')
);

function fixture(account, authError) {
    let handler;
    const calls = [];
    vm.runInNewContext(source, {
        Deno: { serve: value => { handler = value; }, env: { get: key => key } },
        Request, Response,
        createClient(_url, key) {
            return {
                rpc: async (name, params) => {
                    calls.push([key, name, params.p_code]);
                    return { data: account };
                },
                auth: {
                    signInWithPassword: async input => {
                        calls.push([key, input.email]);
                        return { data: { session: { access_token: 'test-session' } }, error: authError };
                    }
                }
            };
        }
    });
    return { calls, signIn: (code, password) => handler(new Request('https://test.invalid', {
        method: 'POST', body: JSON.stringify({ code, password })
    })) };
}

test('code sign-in preserves zeros and hyphens and authenticates server-side', async () => {
    const h = fixture({ email: 'pharmacy@example.invalid', suspended: false });
    const response = await h.signIn(' 00101-0084 ', 'fixture-password');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { access_token: 'test-session' });
    assert.deepEqual(h.calls, [
        ['SUPABASE_SERVICE_ROLE_KEY', 'pharmflow_admin_login_for_code_v2', '00101-0084'],
        ['SUPABASE_ANON_KEY', 'pharmacy@example.invalid']
    ]);
});

test('unknown code and invalid password have the same response', async () => {
    const unknown = await fixture(null).signIn('HHB084', 'fixture-password');
    const invalid = await fixture({ email: 'pharmacy@example.invalid', suspended: false }, { status: 400 }).signIn('hhb084', 'wrong');
    assert.equal(unknown.status, invalid.status);
    assert.equal(await unknown.text(), await invalid.text());
    const limited = await fixture({ email: 'pharmacy@example.invalid', suspended: false }, { status: 429 }).signIn('HHB084', 'fixture-password');
    assert.equal(limited.status, 429);
});

test('suspension is disclosed only with a valid password and returns no session', async () => {
    const account = { email: 'pharmacy@example.invalid', suspended: true };
    const invalid = await fixture(account, { status: 400 }).signIn('HHB084', 'wrong');
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'Invalid sign-in ID or password.' });

    const blocked = await fixture(account).signIn('HHB084', 'fixture-password');
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), { error: 'Pharmacy Suspended. Contact your administrator.' });
});

test('login and password-change forms provide browser autofill fields and omit public account actions', () => {
    const { document } = parseHTML(fs.readFileSync('index.html', 'utf8'));
    assert.equal(document.querySelector('#authLoginForm').tagName, 'FORM');
    assert.equal(document.querySelector('#authEmail').getAttribute('autocomplete'), 'username');
    assert.equal(document.querySelector('#authPassword').getAttribute('autocomplete'), 'current-password');
    const forcedForm = document.querySelector('#authForcedPasswordTemplate').content.querySelector('form');
    assert.ok(forcedForm.querySelector('[autocomplete="username"]'));
    assert.ok(forcedForm.querySelector('[autocomplete="new-password"]'));
    assert.equal(document.querySelector('#btnAuthForgotPassword, #authPublicSignupForm'), null);
    assert.ok(document.querySelector('#ownerCreateAccountForm [name=duty] option[value=DISABLED]'));
});
