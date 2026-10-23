export const STAGING_REF='tovkcakucyagvbzvlnks';
export const PREVIEW_BRANCH='feature/unified-account-header-staging-preview';
export function stagingPreviewConfig(env){
  if(env.VERCEL && (env.VERCEL_ENV!=='preview' || env.VERCEL_GIT_COMMIT_REF!==PREVIEW_BRANCH)){
    throw new Error('This isolated source may only deploy as its approved Vercel Preview branch');
  }
  const url=env.PHARMFLOW_STAGING_SUPABASE_URL;
  const publishableKey=env.PHARMFLOW_STAGING_SUPABASE_ANON_KEY;
  if(url!==`https://${STAGING_REF}.supabase.co`){throw new Error('Exact Staging Supabase URL is required; no fallback is permitted');}
  let claims;
  try{claims=JSON.parse(Buffer.from(publishableKey.split('.')[1],'base64url').toString());}catch{throw new Error('Staging public anon key is required');}
  if(claims.ref!==STAGING_REF || claims.role!=='anon'){throw new Error('Only the Staging public anon key is allowed');}
  return Object.freeze({url,publishableKey});
}
