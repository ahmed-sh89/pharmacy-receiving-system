// Explicit static publication boundary. Never copies the repository wholesale.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function buildArtifact(destination = path.join(root, 'pages-artifact')) {
  const out = path.resolve(destination);
  if(out === root || !out.startsWith(root + path.sep)) throw Error('Artifact must be inside repository output directory');
  // Avoid overwriting any existing directory or following a supplied symlink.
  if(fs.existsSync(out)) throw Error('Use a fresh artifact output directory');
  fs.mkdirSync(out, {recursive: true});
  const copy = (relative) => {
    const from = path.join(root, relative), to = path.join(out, relative);
    if(fs.lstatSync(from).isSymbolicLink()) throw Error('Symlink rejected: ' + relative);
    fs.mkdirSync(path.dirname(to), {recursive:true});
    fs.copyFileSync(from, to);
  };
  for(const file of ['index.html', 'ui.js', 'cloud-workspace.js']) copy(file);
  for(const file of ['version.json', 'dashboard.css']) if(fs.existsSync(path.join(root,file))) copy(file);
  const extensions = {
    js: new Set(['.js','.mjs','.json']),
    css: new Set(['.css']),
    assets: new Set(['.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.ttf','.woff','.woff2','.otf','.json'])
  };
  for(const [directory, allowed] of Object.entries(extensions)) {
    function walk(relative) {
      for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
        const next = path.join(relative,entry.name);
        if(entry.isSymbolicLink()) throw Error('Symlink rejected: ' + next);
        if(entry.isDirectory()) walk(next);
        else if(allowed.has(path.extname(entry.name).toLowerCase()) || /^(?:LICENSE|COPYING|NOTICE)(?:[.-].*)?$/i.test(entry.name)) copy(next);
      }
    }
    walk(directory);
  }
  return out;
}
if(require.main === module) console.log(buildArtifact());
module.exports = {buildArtifact};
