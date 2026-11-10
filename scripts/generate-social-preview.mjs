/** Rebuild the static social card using the About panel's typography, globe and palette.
 * No network requests. Counts are a dated snapshot in scripts/assets/social-preview-data.json.
 * Satori and Resvg come from the existing workers-og dependency.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ogRequire = createRequire(require.resolve('workers-og'));
const satoriModule = await import(pathToFileURL(ogRequire.resolve('satori')).href);
const satori = typeof satoriModule.default === 'function' ? satoriModule.default : satoriModule.default.default;
const resvgModule = await import(pathToFileURL(ogRequire.resolve('@resvg/resvg-wasm')).href);
const { Resvg, initWasm } = resvgModule.default || resvgModule;
await initWasm(await readFile(resolve(dirname(ogRequire.resolve('@resvg/resvg-wasm')), 'index_bg.wasm')));
const data = JSON.parse(await readFile(resolve(root, 'scripts/assets/social-preview-data.json'), 'utf8'));
const flags = JSON.parse(await readFile(resolve(root, 'scripts/assets/social-flags.json'), 'utf8'));
if (!Number.isSafeInteger(data.churches) || !Number.isSafeInteger(data.countries) || data.churches < 1 || data.countries < data.flags.length) throw new Error('Invalid social preview snapshot');
const png = async path => `data:image/png;base64,${(await readFile(resolve(root, path))).toString('base64')}`;
let seed = 7;
const random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const palette = ['#E8D5F5','#C9A0DC','#A855F7','#C9A0DC','#E8D5F5'];
const cx = 1000, cy = 240, radius = 360;
let dots = '', count = 0, pulses = 0;
while (count < 70) {
  const x = random() * 2 - 1, y = random() * 2 - 1;
  if (x*x+y*y > .86) continue;
  const big = random() > .85, r = big ? 8 : 3 + random()*3;
  const color = palette[Math.floor(random()*palette.length)];
  const px = cx+x*radius*.96, py = cy+y*radius*.96;
  if (big && pulses++ < 3) dots += `<circle cx="${px}" cy="${py}" r="${r*3.2}" fill="none" stroke="${color}" stroke-opacity=".1" stroke-width="6"/>`;
  dots += `<circle cx="${px}" cy="${py}" r="${r}" fill="${color}" opacity="${big?1:.8}"/>`; count++;
}
const parallels = [-.6,-.3,0,.3,.6].map(k => {const half=Math.sqrt(1-k*k)*radius;return `<line x1="${cx-half}" y1="${cy+k*radius}" x2="${cx+half}" y2="${cy+k*radius}"/>`;}).join('');
const globe = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#28134c"/><stop offset="1" stop-color="#10091f"/></linearGradient><radialGradient id="glow" cx="38%" cy="32%" r="75%"><stop stop-color="#A855F7" stop-opacity=".4"/><stop offset=".6" stop-color="#6B21A8" stop-opacity=".23"/><stop offset="1" stop-color="#1A0E38" stop-opacity="0"/></radialGradient><linearGradient id="shade"><stop stop-color="#180e30"/><stop offset=".44" stop-color="#180e30" stop-opacity=".96"/><stop offset=".76" stop-color="#180e30" stop-opacity=".1"/><stop offset="1" stop-color="#180e30" stop-opacity="0"/></linearGradient><linearGradient id="fade" x2="0" y2="1"><stop stop-color="#120a25" stop-opacity="0"/><stop offset=".7" stop-color="#120a25" stop-opacity="0"/><stop offset="1" stop-color="#120a25" stop-opacity=".8"/></linearGradient></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#glow)"/><g fill="none" stroke="#E9D5FF" stroke-opacity=".16" stroke-width="1.2"><circle cx="${cx}" cy="${cy}" r="${radius}"/><ellipse cx="${cx}" cy="${cy}" rx="${radius*.35}" ry="${radius}"/><ellipse cx="${cx}" cy="${cy}" rx="${radius*.7}" ry="${radius}"/>${parallels}</g>${dots}<rect width="1200" height="630" fill="url(#shade)"/><rect width="1200" height="630" fill="url(#fade)"/></svg>`;
const el = (type, style, children, props={}) => ({type, props:{style,...props,...(children===undefined?{}:{children})}});
const text = (value, left, top, size, width, weight=400, color='#cbbadd') => el('div',{position:'absolute',display:'flex',left,top,width,fontSize:size,fontWeight:weight,color,lineHeight:1.3},value);
const pill = (value,left,width) => el('div',{position:'absolute',display:'flex',alignItems:'center',justifyContent:'center',left,top:448,width,height:48,borderRadius:25,backgroundColor:'#ffffff14',border:'1px solid #ffffff12',fontSize:22,fontWeight:600,color:'#f5efff'},value);
const flagRow = data.flags.map((code,i)=>el('img',{position:'absolute',left:64+i*41,top:529,width:30,height:21,borderRadius:4},undefined,{src:flags[code],width:30,height:21}));
const tree = el('div',{display:'flex',position:'relative',width:1200,height:630,fontFamily:'Google Sans Flex',backgroundColor:'#180e30'},[
  el('img',{position:'absolute',left:0,top:0,width:1200,height:630},undefined,{src:`data:image/svg+xml;base64,${Buffer.from(globe).toString('base64')}`,width:1200,height:630}),
  el('img',{position:'absolute',left:64,top:60,width:78,height:78,borderRadius:19,border:'1px solid #c9a0dc55'},undefined,{src:await png('src/assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png'),width:78,height:78}),
  text('Here’s My Church',64,176,64,750,600,'#ffffff'),
  text('An interactive map of Christian churches',66,281,26,650),
  text('worldwide, built to be the most accurate',66,320,26,650),
  text('place to find one.',66,359,26,650),
  pill(`${data.churches.toLocaleString('en-US')} churches`,64,268),pill(`${data.countries} countries`,346,184),
  ...flagRow,text(`+${data.countries-data.flags.length}`,478,527,21,60,600,'#bca4d1'),
  text('heresmychurch.com',917,558,19,230,400,'#b49ac9'),
]);
const svg = await satori(tree,{width:1200,height:630,fonts:[{name:'Google Sans Flex',data:await readFile(resolve(root,'public/fonts/og/GoogleSansFlex-Body.ttf')),weight:400,style:'normal'},{name:'Google Sans Flex',data:await readFile(resolve(root,'public/fonts/og/GoogleSansFlex-Title.ttf')),weight:600,style:'normal'}]});
const output = new Resvg(svg).render();
if(output.width!==1200 || output.height!==630) throw new Error('Unexpected image size');
await writeFile(resolve(root,'public/og-image.svg'),svg);
await writeFile(resolve(root,'public/og-image.png'),output.asPng());
console.log(`Generated 1200×630 About-inspired social preview; snapshot ${data.asOf}.`);
