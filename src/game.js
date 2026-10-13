import { COLS, ROWS, TILE, DIRECTIONS, OPPOSITE, keyOf, roadAt, exits, distanceMap, createWorld, createActor, reverseActor, moveActor, randomGenerator } from './world.js';
import { ArcadeAudio } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const radar = $('radar'), radarCtx = radar.getContext('2d');
const audio = new ArcadeAudio();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const storage = { get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing can disable storage. */ } } };
let best = Number(storage.get('rally-x-best', 0)) || 0;
let state = 'ready', round = 1, score = 0, lives = 3, fuel = 100, collected = 0, multiplier = 1;
let world, player, enemies, desired = 'right', clouds = [], particles = [], popups = [];
let invincible = 0, smokeCooldown = 0, stunAwards = new Set(), camera = { x: 0, y: 0 };
let width = 900, height = 535, elapsed = 0, shake = 0, toastTimeout, lastTime = 0, accumulator = 0, radarClock = 0;
let pathClock = 0, pursuitMap, starting = false, helpPaused = false;
let scenery, frameId;
const padScore = value => String(Math.floor(value)).padStart(6, '0');
const dist = (a,b) => Math.hypot(a.x - b.x, a.y - b.y);
const carColors = ['#ee8075','#eea16f','#d88399','#d88e69','#e66b6b','#ca87ab'];

function rounded(context,x,y,w,h,r,fill,stroke) {
  context.beginPath(); context.roundRect(x,y,w,h,r);
  if (fill) { context.fillStyle=fill; context.fill(); }
  if (stroke) { context.strokeStyle=stroke; context.lineWidth=1; context.stroke(); }
}

function resetRound() {
  world = createWorld(round);
  player = createActor(world.spawn.x, world.spawn.y);
  enemies = world.enemySpawns.map((p,i) => ({ ...createActor(p.x,p.y,'left'), id:i, stun:0, color:carColors[i], spawn:p }));
  desired = 'right'; clouds = []; particles = []; popups = []; stunAwards.clear();
  collected = 0; multiplier = 1; fuel = 100; invincible = 2.5; smokeCooldown = 0;
  pursuitMap = distanceMap(world.grid, world.spawn); pathClock = 0;
  camera = cameraTarget();
  buildScenery(); updateHUD(); drawRadar();
  $('world-round').textContent = `ROUND ${String(round).padStart(2,'0')}`;
  $('mission-round').textContent = `${String(round).padStart(2,'0')} / ∞`;
}

function buildScenery() {
  scenery = document.createElement('canvas'); scenery.width = COLS*TILE; scenery.height = ROWS*TILE;
  const c = scenery.getContext('2d'), random = randomGenerator(291 + round);
  c.fillStyle = '#233236'; c.fillRect(0,0,scenery.width,scenery.height);
  // A subtle asphalt texture, cached once instead of generated every frame.
  for(let i=0;i<18000;i++) { c.fillStyle = random()>.5 ? '#ffffff04' : '#00000009'; c.fillRect(random()*scenery.width,random()*scenery.height,1.5,1.5); }
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) {
    const px=x*TILE, py=y*TILE;
    if (world.grid[y][x]) {
      c.fillStyle='#0c171a55'; c.fillRect(px+5,py+7,TILE,TILE);
      c.fillStyle='#506247'; c.fillRect(px+1,py+1,TILE-2,TILE-2);
      c.fillStyle='#354b3d'; c.fillRect(px+4,py+4,TILE-8,TILE-8);
      const shade = random();
      c.fillStyle = shade>.7 ? '#3a5141' : shade>.3 ? '#324839' : '#2e4437';
      c.fillRect(px+7,py+7,TILE-14,TILE-14);
      const canBuild = x>1 && y>1 && x<COLS-2 && y<ROWS-2 && x%2===0 && y%2===0;
      if (canBuild && random()>.28) {
        const isWarm = random()>.8;
        rounded(c,px+11,py+13,32,30,2,'#10242580');
        rounded(c,px+8,py+8,32,29,2,isWarm?'#6c6953':'#576659','#87907870');
        rounded(c,px+12,py+12,24,20,1,isWarm?'#565844':'#3c5148');
        c.fillStyle='#8a977468'; c.fillRect(px+13,py+12,22,2);
        c.fillStyle='#273e39'; c.fillRect(px+16,py+18,9,7);
        c.fillStyle='#73816b'; c.fillRect(px+17,py+18,7,2);
        if(random()>.45) { c.fillStyle='#bcbe7680'; c.fillRect(px+12,py+36,5,2); c.fillRect(px+29,py+36,5,2); }
      } else {
        for(let j=0;j<2;j++) {
          const tx=px+14+random()*25,ty=py+13+random()*24,r=8+random()*6;
          c.fillStyle='#122d2580'; c.beginPath(); c.ellipse(tx+3,ty+4,r,r*.8,0,0,Math.PI*2); c.fill();
          c.fillStyle=['#49643d','#547047','#405f3d'][Math.floor(random()*3)]; c.beginPath(); c.arc(tx,ty,r,0,Math.PI*2); c.fill();
          c.fillStyle='#6d874544'; c.beginPath(); c.arc(tx-3,ty-3,r*.56,0,Math.PI*2); c.fill();
        }
      }
      // Tiny warm path lights sit at the corners of planted blocks.
      if(x%2===0 && y%2===0 && random()>.55) {
        const light=c.createRadialGradient(px+4,py+4,0,px+4,py+4,15); light.addColorStop(0,'#dbe89924');light.addColorStop(1,'#dbe89900');
        c.fillStyle=light;c.fillRect(px-12,py-12,32,32);c.fillStyle='#bacb82';c.fillRect(px+3,py+3,2,2);
      }
    } else {
      const vertical=roadAt(world.grid,x,y-1)&&roadAt(world.grid,x,y+1);
      const horizontal=roadAt(world.grid,x-1,y)&&roadAt(world.grid,x+1,y);
      c.fillStyle='#b9cbaa19';
      if(vertical) { c.fillRect(px+25,py+8,2,8); c.fillRect(px+25,py+36,2,8); }
      if(horizontal) { c.fillRect(px+8,py+25,8,2); c.fillRect(px+36,py+25,8,2); }
      if(!vertical && !horizontal) { c.fillStyle='#a4b89816';c.fillRect(px+24,py+24,4,4); }
      if(exits(world.grid,x,y).length>=3 && (x+y)%7===0) {
        c.fillStyle='#bdc8a52d';for(let j=0;j<5;j++) c.fillRect(px+10+j*7,py+6,3,7);
      }
    }
  }
  // Start grid markings.
  for(let i=0;i<6;i++) for(let j=0;j<2;j++) {
    c.fillStyle=(i+j)%2?'#bed0a650':'#192c2e';c.fillRect(TILE*1.25+j*7,TILE*1.08+i*7,7,7);
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect(); width=rect.width; height=rect.height;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  if(player) camera=cameraTarget();
}
function cameraTarget() {
  const maxX=COLS*TILE-width,maxY=ROWS*TILE-height;
  return { x:Math.max(0,Math.min(maxX,(player.x+.5)*TILE-width*.5)), y:Math.max(0,Math.min(maxY,(player.y+.5)*TILE-height*.5)) };
}
function showToast(text) { $('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2200); }
function addScore(value) { score+=value; if(score>best){best=score;storage.set('rally-x-best',best);} }
function updateHUD() {
  $('score').textContent=padScore(score);$('best-score').textContent=padScore(best);
  $('flags').textContent=String(collected).padStart(2,'0');$('fuel-number').textContent=`${Math.ceil(fuel)}%`;
  $('fuel-bar').style.width=`${fuel}%`;
  $('fuel-bar').style.filter=fuel<25?'hue-rotate(290deg) saturate(2)':'none';
  if($('lives').dataset.count!==String(lives)) { $('lives').innerHTML=Array.from({length:3},(_,i)=>`<i class="life${i>=lives?' lost':''}"></i>`).join('');$('lives').dataset.count=lives;$('lives').setAttribute('aria-label',`${lives} lives`); }
  if($('mission-progress').dataset.count!==String(collected)) { $('mission-progress').innerHTML=Array.from({length:10},(_,i)=>`<i class="${i<collected?'done':''}"></i>`).join('');$('mission-progress').dataset.count=collected;$('mission-progress').setAttribute('aria-label',`${collected} of 10 flags collected`); }
  $('smoke-status').textContent=smokeCooldown>0?`Recharging · ${smokeCooldown.toFixed(1)}s`:fuel<5?'Not enough fuel':'Ready to deploy';
}

async function startRun() {
  if(starting) return;starting=true;
  round=1;score=0;lives=3;elapsed=0;resetRound();state='playing';
  $('start-overlay').hidden=true;$('state-overlay').hidden=true;$('pause-button').disabled=false;
  $('pause-button').setAttribute('aria-label','Pause game');$('pause-button').innerHTML='<span>Ⅱ</span>';
  $('game-status').textContent='THE CHASE IS ON';
  await audio.unlock();
  if(state==='playing'){audio.step=0;audio.start();audio.effect('start');}
  canvas.focus({preventScroll:true});showToast('10 FLAGS. ONE GREAT ESCAPE.');starting=false;
}

function setPause(paused) {
  if(paused && state!=='playing' || !paused && state!=='paused') return;
  if(paused) {
    state='paused';audio.pause();
    showState('TAKE A BREATHER','Parked for a moment.','Your getaway can wait. Press P or resume when you’re ready.','Back to the chase');
    $('game-status').textContent='PARKED FOR A MOMENT';$('pause-button').innerHTML='<span>▷</span>';$('pause-button').setAttribute('aria-label','Resume game');
  } else {
    state='playing';$('state-overlay').hidden=true;audio.unlock();audio.start();
    $('pause-button').innerHTML='<span>Ⅱ</span>';$('pause-button').setAttribute('aria-label','Pause game');$('game-status').textContent='THE CHASE IS ON';canvas.focus({preventScroll:true});
  }
}
function showState(kicker,title,description,button) {
  $('state-kicker').textContent=kicker;$('state-title').textContent=title;$('state-description').textContent=description;
  $('state-button').innerHTML=`${button} <span>↗</span>`;$('state-overlay').hidden=false;
  $('restart-button').hidden=state==='over';$('state-button').focus({preventScroll:true});
}
function clearRound() {
  const bonus=Math.floor(fuel)*20;addScore(bonus);state='clear';audio.pause();audio.effect('clear');
  $('pause-button').disabled=true;$('game-status').textContent='NEIGHBORHOOD CLEARED';
  showState('A CLEAN GETAWAY',`Round ${String(round).padStart(2,'0')}. In the bag.`,`All 10 flags secured. +${bonus.toLocaleString()} fuel bonus. The next neighborhood has faster company.`, 'Next neighborhood');updateHUD();
}
function nextRound() { round++;resetRound();state='playing';$('state-overlay').hidden=true;$('pause-button').disabled=false;$('game-status').textContent='THE CHASE IS ON';audio.unlock();audio.start();audio.effect('start');canvas.focus({preventScroll:true});showToast(`ROUND ${round} · A NEW NEIGHBORHOOD`); }
function crash(reason) {
  if(invincible>0 || state!=='playing')return;
  audio.effect('crash');burst(player.x,player.y,'#efab76',24);shake=reduceMotion?0:12;lives--;
  if(lives<=0) {
    state='over';audio.pause();$('pause-button').disabled=true;$('game-status').textContent='UNTIL THE NEXT GETAWAY';
    showState('THAT WAS A GOOD RUN','End of the road.',`${reason} You scored ${score.toLocaleString()} across ${round} ${round===1?'round':'rounds'}. There’s always one more getaway.`, 'Take another spin');
  } else {
    player=createActor(world.spawn.x,world.spawn.y);desired='right';fuel=Math.max(fuel,55);invincible=3.5;clouds=[];
    enemies=enemies.map(e=>({...createActor(e.spawn.x,e.spawn.y,'left'),id:e.id,color:e.color,spawn:e.spawn,stun:0}));
    camera=cameraTarget();showToast(`${reason.toUpperCase()} · ${lives} ${lives===1?'LIFE':'LIVES'} LEFT`);
  }
  updateHUD();
}
function steer(dir) {
  if(state!=='playing') return;
  desired=dir;
  if(player.moving && OPPOSITE[player.dir]===dir) reverseActor(player);
}
function smoke() {
  if(state!=='playing'||smokeCooldown>0)return;
  if(fuel<5){showToast('LOW FUEL · FIND A GREEN FUEL CAN');return;}
  fuel-=4;smokeCooldown=1.1;audio.effect('smoke');
  const d=DIRECTIONS[player.dir];clouds.push({x:player.x-d.x*.38,y:player.y-d.y*.38,life:3,maxLife:3,seed:Math.random()*10});
  burst(player.x-d.x*.3,player.y-d.y*.3,'#c2b9d5',8);
}
function burst(x,y,color,count=12) {
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=15+Math.random()*55;particles.push({x:(x+.5)*TILE,y:(y+.5)*TILE,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.4+Math.random()*.5,maxLife:.9,color,size:2+Math.random()*2});}
}
function popup(x,y,text,color='#d3f599'){popups.push({x:(x+.5)*TILE,y:(y+.5)*TILE,text,color,life:1.2});}
function enemyDirection(e) {
  let available=exits(world.grid,e.fromX,e.fromY);
  const blocked=new Set(world.obstacles.map(p=>keyOf(p.x,p.y)));
  const clean=available.filter(dir=>{const d=DIRECTIONS[dir];return !blocked.has(keyOf(e.fromX+d.x,e.fromY+d.y));});
  if(clean.length)available=clean;
  const forward=available.filter(dir=>dir!==OPPOSITE[e.dir]);
  if(forward.length)available=forward;
  if(Math.random()<.1+e.id*.035)return available[Math.floor(Math.random()*available.length)];
  return available.sort((a,b)=>{
    const da=DIRECTIONS[a],db=DIRECTIONS[b];
    return (pursuitMap.get(keyOf(e.fromX+da.x,e.fromY+da.y))??999)-(pursuitMap.get(keyOf(e.fromX+db.x,e.fromY+db.y))??999);
  })[0];
}

function update(dt) {
  elapsed+=dt;smokeCooldown=Math.max(0,smokeCooldown-dt);invincible=Math.max(0,invincible-dt);
  fuel=Math.max(0,fuel-dt*(.39+Math.min(round*.018,.18)));
  if(fuel<=0){invincible=0;crash('Out of fuel');return;}
  moveActor(player,4.1,dt,world.grid,a=>{
    const want=DIRECTIONS[desired];
    if(roadAt(world.grid,a.fromX+want.x,a.fromY+want.y))return desired;
    const d=DIRECTIONS[a.dir];
    return roadAt(world.grid,a.fromX+d.x,a.fromY+d.y)?a.dir:null;
  });
  pathClock-=dt;
  if(pathClock<=0){pursuitMap=distanceMap(world.grid,{x:Math.round(player.x),y:Math.round(player.y)},new Set(world.obstacles.map(p=>keyOf(p.x,p.y))));pathClock=.23;}
  for(const e of enemies){
    e.stun=Math.max(0,e.stun-dt);
    const inSmoke=clouds.some(c=>c.life>.35&&dist(c,e)<.9);
    if(inSmoke){
      if(e.stun===0){burst(e.x,e.y,'#c1b3df',8);if(!stunAwards.has(e.id)){addScore(50);popup(e.x,e.y,'+50','#c8b8e4');stunAwards.add(e.id);}}
      e.stun=3;
    }
    if(e.stun<=0)moveActor(e,Math.min(2.75+round*.13+e.id*.07,3.7),dt,world.grid,enemyDirection);
    if(e.stun<=0&&dist(e,player)<.52&&invincible<=0){crash('Caught in the chase');return;}
  }
  for(const f of world.flags)if(!f.collected&&dist(f,player)<.48){
    f.collected=true;collected++;if(f.special)multiplier=2;
    const value=100*multiplier;addScore(value);burst(f.x,f.y,f.special?'#d0a6f0':'#edcb7a');popup(f.x,f.y,`+${value}`);audio.effect(f.special?'special':'flag');
    if(f.special)showToast('SPECIAL FLAG · FLAG POINTS ×2');
    else if(collected===9)showToast('ONE FLAG LEFT · CHECK YOUR RADAR');
    if(collected===10){clearRound();return;}
  }
  for(const f of world.fuels)if(!f.collected&&dist(f,player)<.5){f.collected=true;fuel=Math.min(100,fuel+30);audio.effect('fuel');burst(f.x,f.y,'#94dbb2');popup(f.x,f.y,'+30% FUEL','#97ddb3');}
  for(const p of world.obstacles)if(dist(p,player)<.46&&invincible<=0){crash('Roadblock collision');return;}
  clouds=clouds.filter(c=>(c.life-=dt)>0);
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.98;p.vy*=.98;}
  particles=particles.filter(p=>p.life>0);
  for(const p of popups){p.life-=dt;p.y-=dt*25;}popups=popups.filter(p=>p.life>0);
  const target=cameraTarget(),follow=1-Math.exp(-dt*7);camera.x+=(target.x-camera.x)*follow;camera.y+=(target.y-camera.y)*follow;shake=Math.max(0,shake-dt*35);
}

function drawCar(a,color,isPlayer=false,time=0) {
  const px=(a.x+.5)*TILE,py=(a.y+.5)*TILE;
  const target=DIRECTIONS[a.dir].angle;
  let difference=(target-a.angle+Math.PI*3)%(Math.PI*2)-Math.PI;
  a.angle+=difference*(reduceMotion?1:.35);
  ctx.save();ctx.translate(px,py);ctx.rotate(a.angle+Math.PI/2);
  if(isPlayer&&invincible>0&&state==='playing'&&Math.sin(time*22)<-.25)ctx.globalAlpha=.45;
  if(isPlayer){
    const glow=ctx.createRadialGradient(0,0,5,0,0,33);glow.addColorStop(0,'#cef98422');glow.addColorStop(1,'#cef98400');ctx.fillStyle=glow;ctx.fillRect(-34,-34,68,68);
    // Soft headlight beams point in the direction of travel.
    const beam=ctx.createLinearGradient(0,-12,0,-75);beam.addColorStop(0,'#e6ffc317');beam.addColorStop(1,'#e6ffc300');ctx.fillStyle=beam;
    ctx.beginPath();ctx.moveTo(-9,-15);ctx.lineTo(-26,-80);ctx.lineTo(26,-80);ctx.lineTo(9,-15);ctx.closePath();ctx.fill();
  }
  rounded(ctx,-12,-14,28,39,6,'#06121680');
  rounded(ctx,-14,-12,5,10,1,'#091215');rounded(ctx,9,-12,5,10,1,'#091215');rounded(ctx,-14,8,5,10,1,'#091215');rounded(ctx,9,8,5,10,1,'#091215');
  rounded(ctx,-11,-21,22,41,5,color);
  ctx.fillStyle='#ffffff17';ctx.fillRect(-8,-17,3,32);ctx.fillStyle='#122c2b33';ctx.fillRect(-2,-20,4,39);
  rounded(ctx,-8,-8,16,10,2,'#183b40');ctx.fillStyle='#7cafab66';ctx.fillRect(-6,-7,12,2);
  rounded(ctx,-7,10,14,5,1,'#244246');
  ctx.fillStyle='#f4ffd8';ctx.fillRect(-9,-19,5,3);ctx.fillRect(4,-19,5,3);
  ctx.fillStyle=isPlayer?'#f79b68':'#ffccb0';ctx.fillRect(-9,17,5,2);ctx.fillRect(4,17,5,2);
  ctx.fillStyle='#253a3699';ctx.fillRect(-8,20,16,2);
  if(!isPlayer){ctx.fillStyle='#ffd3a1';ctx.fillRect(-6,3,12,2);}
  ctx.restore();
  if(a.stun>0){
    ctx.save();ctx.translate(px,py);ctx.strokeStyle='#bda9e1';ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(0,-24,17,6,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<3;i++){const t=time*3+i*Math.PI*2/3;ctx.fillStyle='#d8c4fc';ctx.fillRect(Math.cos(t)*17-2,-26+Math.sin(t)*6,4,4);}ctx.restore();
  }
}

function drawFlag(flag,time) {
  const x=(flag.x+.5)*TILE,y=(flag.y+.5)*TILE,bob=reduceMotion?0:Math.sin(time*3+flag.x)*2;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle=flag.special?'#c6a6e412':'#efc97210';ctx.beginPath();ctx.arc(0,0,21+Math.sin(time*2)*2,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=flag.special?'#c6a6e442':'#efc97235';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#06171d50';ctx.beginPath();ctx.ellipse(1,12,10,4,0,0,Math.PI*2);ctx.fill();
  ctx.translate(0,bob);ctx.fillStyle='#e2dbab';ctx.fillRect(-5,-15,2,28);
  ctx.fillStyle=flag.special?'#c1a0e4':'#e9c574';ctx.beginPath();ctx.moveTo(-3,-15);ctx.lineTo(15,-13);ctx.lineTo(10,-7);ctx.lineTo(14,-2);ctx.lineTo(-3,-4);ctx.fill();
  if(flag.special){ctx.fillStyle='#4e3b61';ctx.font='bold 9px monospace';ctx.fillText('S',0,-6);}
  ctx.restore();
}

function draw(time) {
  ctx.clearRect(0,0,width,height);ctx.save();
  const idle=state==='ready';
  // The attract screen previews the central neighborhood; live play follows the car.
  const cx=idle?Math.max(0,COLS*TILE*.49-width/2):camera.x;
  const cy=idle?Math.max(0,ROWS*TILE*.47-height/2):camera.y;
  ctx.translate(-Math.round(cx)+(shake?Math.sin(time*80)*shake:0),-Math.round(cy)+(shake?Math.cos(time*70)*shake*.5:0));
  ctx.drawImage(scenery,0,0);
  for(const f of world.flags)if(!f.collected)drawFlag(f,time);
  for(const f of world.fuels)if(!f.collected){
    const x=(f.x+.5)*TILE,y=(f.y+.5)*TILE;
    rounded(ctx,x-12,y-12,24,25,5,'#7ecc9b18','#8adea144');
    rounded(ctx,x-6,y-7,13,16,2,'#8ccda7');ctx.fillStyle='#284c3e';ctx.fillRect(x-3,y-3,7,6);
    ctx.strokeStyle='#8ccda7';ctx.lineWidth=2;ctx.strokeRect(x-3,y-10,6,4);ctx.fillStyle='#d3f7cd';ctx.fillRect(x-1,y-2,2,4);ctx.fillRect(x-2,y-1,4,2);
  }
  for(const p of world.obstacles){
    const x=(p.x+.5)*TILE,y=(p.y+.5)*TILE;ctx.save();ctx.translate(x,y);ctx.rotate(.15);
    rounded(ctx,-16,-8,32,19,3,'#101c20');rounded(ctx,-16,-12,32,17,2,'#a8794b','#d1a16c');
    ctx.save();ctx.beginPath();ctx.rect(-15,-11,30,15);ctx.clip();ctx.strokeStyle='#413d32';ctx.lineWidth=5;
    for(let i=-25;i<25;i+=12){ctx.beginPath();ctx.moveTo(i,-12);ctx.lineTo(i+14,5);ctx.stroke();}ctx.restore();ctx.fillStyle='#e3b97e';ctx.fillRect(-15,-11,30,2);ctx.restore();
  }
  for(const e of enemies)drawCar(e,e.color,false,time);
  if(idle){drawCar({...createActor(13,9,'down')},'#d0ef93',true,time);drawCar({...createActor(21,11,'left')},'#eb8775',false,time);}
  else drawCar(player,'#cff38f',true,time);
  for(const c of clouds){
    const alpha=Math.min(1,c.life)*.42,age=c.maxLife-c.life;
    for(let i=0;i<7;i++){const a=i*2.4+c.seed;ctx.fillStyle=`rgba(179,170,198,${alpha})`;ctx.beginPath();ctx.arc((c.x+.5)*TILE+Math.cos(a)*(8+age*7),(c.y+.5)*TILE+Math.sin(a)*(8+age*6),13+age*6,0,Math.PI*2);ctx.fill();}
  }
  for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}ctx.globalAlpha=1;
  for(const p of popups){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.font='bold 13px monospace';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y-20);}ctx.globalAlpha=1;ctx.textAlign='left';
  ctx.restore();
  if(fuel<25&&state==='playing'){ctx.fillStyle=`rgba(216,111,70,${.035+Math.sin(time*4)*.02})`;ctx.fillRect(0,0,width,height);}
}

function drawRadar() {
  const c=radarCtx,w=radar.width,h=radar.height,s=Math.min((w-12)/COLS,(h-12)/ROWS),ox=(w-COLS*s)/2,oy=(h-ROWS*s)/2;
  c.clearRect(0,0,w,h);c.fillStyle='#122023';c.fillRect(0,0,w,h);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){c.fillStyle=world.grid[y][x]?'#2c4135':'#142728';c.fillRect(ox+x*s,oy+y*s,s-.8,s-.8);}
  for(const f of world.flags)if(!f.collected){c.fillStyle=f.special?'#cbb0ee':'#edc77d';c.fillRect(ox+(f.x+.5)*s-2,oy+(f.y+.5)*s-2,4,4);}
  for(const f of world.fuels)if(!f.collected){c.fillStyle='#77ac8e';c.fillRect(ox+(f.x+.5)*s-1,oy+(f.y+.5)*s-1,2.5,2.5);}
  for(const e of enemies){c.fillStyle=e.stun>0?'#b49bd3':'#e6796e';c.beginPath();c.arc(ox+(e.x+.5)*s,oy+(e.y+.5)*s,2.7,0,Math.PI*2);c.fill();}
  c.strokeStyle='#d5f79738';c.lineWidth=1;c.beginPath();c.arc(ox+(player.x+.5)*s,oy+(player.y+.5)*s,7,0,Math.PI*2);c.stroke();
  c.fillStyle='#d7f79d';c.beginPath();c.arc(ox+(player.x+.5)*s,oy+(player.y+.5)*s,3,0,Math.PI*2);c.fill();
  if(state!=='ready'){c.strokeStyle='#d0e5a822';c.strokeRect(ox+camera.x/TILE*s,oy+camera.y/TILE*s,width/TILE*s,height/TILE*s);}
}

function frame(timestamp) {
  const delta=Math.min((timestamp-lastTime)/1000||0, .1);lastTime=timestamp;
  if(state==='playing'){
    accumulator+=delta;
    while(accumulator>=1/120&&state==='playing'){update(1/120);accumulator-=1/120;}
  } else accumulator=0;
  draw(reduceMotion?0:timestamp/1000);radarClock+=delta;
  if(radarClock>.09){drawRadar();updateHUD();radarClock=0;}
  frameId=requestAnimationFrame(frame);
}

const keyDirs={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',w:'up',d:'right',s:'down',a:'left'};
window.addEventListener('keydown',e=>{
  if($('help-dialog').open)return;
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  if((key==='Enter'||key===' ')&&e.target instanceof HTMLButtonElement)return;
  if(keyDirs[key]||key===' '||key==='Enter')e.preventDefault();
  if(keyDirs[key])steer(keyDirs[key]);
  if(key===' '&&!e.repeat)smoke();
  if((key==='p'||key==='Escape')&&!e.repeat)setPause(state==='playing');
  if(key==='m'&&!e.repeat)toggleSound();
  if(key==='Enter'&&!e.repeat){if(state==='ready'||state==='over')startRun();else if(state==='clear')nextRound();else if(state==='paused')setPause(false);}
});
function toggleSound(){audio.setMuted(!audio.muted);storage.set('rally-x-muted',String(audio.muted));updateSound();}
function updateSound(){$('sound-button').setAttribute('aria-pressed',String(audio.muted));$('sound-button').setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');$('sound-label').textContent=audio.muted?'Sound off':'Sound on';}
$('start-button').addEventListener('click',startRun);
$('pause-button').addEventListener('click',()=>setPause(state==='playing'));
$('state-button').addEventListener('click',()=>{if(state==='paused')setPause(false);else if(state==='clear')nextRound();else startRun();});
$('restart-button').addEventListener('click',startRun);
$('sound-button').addEventListener('click',toggleSound);
$('help-button').addEventListener('click',()=>{helpPaused=state==='playing';if(helpPaused)setPause(true);$('help-dialog').showModal();});
function closeHelp(){$('help-dialog').close();}
$('close-help').addEventListener('click',closeHelp);$('help-done').addEventListener('click',closeHelp);
$('help-dialog').addEventListener('close',()=>{if(helpPaused&&state==='paused')setPause(false);helpPaused=false;});
document.querySelectorAll('[data-dir]').forEach(button=>button.addEventListener('pointerdown',e=>{e.preventDefault();steer(button.dataset.dir);}));
$('touch-smoke').addEventListener('pointerdown',e=>{e.preventDefault();smoke();});
window.addEventListener('blur',()=>{if(state==='playing')setPause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')setPause(true);});
window.addEventListener('pagehide',()=>{audio.pause();cancelAnimationFrame(frameId);});
window.addEventListener('pageshow',e=>{if(e.persisted){lastTime=0;frameId=requestAnimationFrame(frame);}});
new ResizeObserver(resize).observe($('viewport'));
audio.setMuted(storage.get('rally-x-muted','false')==='true');updateSound();resetRound();resize();requestAnimationFrame(frame);
