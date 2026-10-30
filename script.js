const $=s=>document.querySelector(s),W=1000,H=560,R=12,GH=80,WIN=5,HW=8,HH=17,KICKV=1150,VMAX=1600,AIM=.5,AIMMAX=.45,MINV=140;
const COL=['#19e3ff','#ff2fd6'],TN=['Ciano','Magenta'];
// [x, time, qtd bonecos, espaçamento] — ordem: GK, ATQ, DEF, MEIO...
const RODS=[[50,0,1,0],[170,1,3,150],[310,0,2,160],[430,1,5,100],[570,0,5,100],[690,1,2,160],[830,0,3,150],[950,1,1,0]]
 .map(([x,t,n,g])=>({x,t,n,g,lim:n==1?80:263-(n-1)*g/2}));
const CORN=[[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]];
let G=null,mode=null,isHost=false,peer,conn,conns=[],myId=0,lobby=[],nextId=1,ctrls=[],last=0,acc=0,fr=0;
const down={},ALL={up:['KeyW','ArrowUp'],dn:['KeyS','ArrowDown'],pv:['KeyA','ArrowLeft'],nx:['KeyD','ArrowRight'],kk:['Space','Enter']};
const show=id=>document.querySelectorAll('.scr').forEach(e=>e.classList.toggle('on',e.id==id));
const toast=m=>{const t=$('#toast');t.textContent=m;t.style.opacity=1;setTimeout(()=>t.style.opacity=0,2500)};
const nome=()=>$('#nome').value.trim()||'Jogador';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function goMenu(){try{peer&&peer.destroy()}catch(e){}peer=conn=null;conns=[];lobby=[];nextId=1;G=null;mode=null;isHost=false;ctrls=[];show('menu')}
document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=goMenu);

/* ---------- JOGO ---------- */
function newGame(list){
  const players=list.map(p=>({id:p.id,name:p.name,team:p.team,rods:[],in:{sel:-1,mv:0,ty:null,k:0,pk:0}}));
  [0,1].forEach(t=>{const m=players.filter(p=>p.team==t);let j=0;
    RODS.forEach((r,i)=>{if(r.t==t&&m.length){m[j%m.length].rods.push(i);j++}})});
  players.forEach(p=>p.in.sel=p.rods[0]);
  G={players,rods:RODS.map(()=>({o:0,d:0,kt:0,vy:0})),b:{x:W/2,y:H/2,vx:0,vy:0},d:{x:W/2,y:H/2},sc:[0,0],ph:'play',pt:0,w:-1,dir:1};
  serve(1);$('#fim').style.display='none';
}
function serve(d){G.b={x:W/2,y:H/2,vx:d*220,vy:(Math.random()-.5)*200}}

function step(dt){
  if(G.ph=='end')return;
  if(G.ph=='goal'){G.pt-=dt;if(G.pt<=0){G.ph='play';serve(G.dir)}return}
  G.rods.forEach(r=>{r.vy=0;r.kt=Math.max(0,r.kt-dt)});
  for(const p of G.players){
    const i=p.in,ri=p.rods.includes(i.sel)?i.sel:p.rods[0],r=G.rods[ri],rd=RODS[ri];
    const d=i.ty!=null?clamp(i.ty-r.o,-750*dt,750*dt):(i.mv||0)*440*dt;
    const n=clamp(r.o+d,-rd.lim,rd.lim);r.vy=(n-r.o)/dt;r.o=n;
    if(i.k&&r.kt<=0){r.kt=.2;r.ai=0}
  }
  const b=G.b,h=dt/3;
  for(let s=0;s<3;s++){
    b.x+=b.vx*h;b.y+=b.vy*h;
    if(b.y<R){b.y=R;b.vy=Math.abs(b.vy)*.9}
    if(b.y>H-R){b.y=H-R;b.vy=-Math.abs(b.vy)*.9}
    if(Math.abs(b.y-H/2)>=GH){
      if(b.x<R){b.x=R;b.vx=Math.abs(b.vx)*.8}
      if(b.x>W-R){b.x=W-R;b.vx=-Math.abs(b.vx)*.8}
    }
    CORN.forEach(([cx,cy,sx,sy])=>{const u=((b.x-cx)*sx+(b.y-cy)*sy-70)/1.4142;
      if(u<R){const nx=sx/1.4142,ny=sy/1.4142;b.x+=nx*(R-u);b.y+=ny*(R-u);const vn=b.vx*nx+b.vy*ny;if(vn<0){b.vx-=1.7*vn*nx;b.vy-=1.7*vn*ny}}});
    RODS.forEach((rd,i)=>{
      const r=G.rods[i],d=rd.t?-1:1,q=1-r.kt/.2,fw=r.kt>0&&q<.5,ex=r.kt>0?24*Math.sin(Math.PI*q):0;
      for(let j=0;j<rd.n;j++){
        const fx=rd.x+d*ex,fy=H/2+(j-(rd.n-1)/2)*rd.g+r.o;
        const cx=clamp(b.x,fx-HW,fx+HW),cy=clamp(b.y,fy-HH,fy+HH);
        let dx=b.x-cx,dy=b.y-cy,ds=Math.hypot(dx,dy);
        if(ds<R){
          if(ds<1e-3){dx=d;dy=0;ds=1}
          const nx=dx/ds,ny=dy/ds;b.x+=nx*(R-ds);b.y+=ny*(R-ds);
          const vn=(b.vx-(fw?d*KICKV:0))*nx+(b.vy-r.vy)*ny;
          if(vn<0){b.vx-=1.4*vn*nx;b.vy-=1.4*vn*ny;
            if(fw&&!r.ai&&b.vx*d>0){r.ai=1;/* chute teleguiado: gira a direção rumo ao centro do gol adversário */
              const sp0=Math.hypot(b.vx,b.vy),gx=d>0?W:0,an=Math.atan2(b.vy,b.vx*d),tg=Math.atan2(H/2-b.y,Math.max(40,Math.abs(gx-b.x))),na=an+clamp((tg-an)*AIM,-AIMMAX,AIMMAX);
              b.vx=d*Math.cos(na)*sp0;b.vy=Math.sin(na)*sp0}}
          if(Math.abs(ny)>.7&&Math.abs(r.vy)>30&&Math.abs(b.x-rd.x)<HW+6&&b.vx*d<140)b.vx=d*140;
        }
      }
    });
  }
  const sp=Math.hypot(b.vx,b.vy);if(sp>VMAX){b.vx*=VMAX/sp;b.vy*=VMAX/sp}
  b.vx*=1-.35*dt;b.vy*=1-.35*dt;
  {const v=Math.hypot(b.vx,b.vy); /* a bola nunca para: mantém velocidade mínima */
    if(v<1){const an=Math.random()*6.283;b.vx=Math.cos(an)*MINV;b.vy=Math.sin(an)*MINV}
    else if(v<MINV){b.vx*=MINV/v;b.vy*=MINV/v}}
  if(b.x<-6||b.x>W+6){
    const t=b.x>W?0:1;G.sc[t]++;G.dir=t?1:-1;G.ph='goal';G.pt=1.5;
    if(G.sc[t]>=WIN){G.ph='end';G.w=t}
  }
}

/* ---------- DESENHO ---------- */
function draw(){
  const c=$('#cv').getContext('2d');
  const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0a1636');g.addColorStop(1,'#050a1c');
  c.fillStyle=g;c.fillRect(0,0,W,H);
  c.strokeStyle='#19e3ff14';c.lineWidth=1;c.beginPath();
  for(let x=0;x<=W;x+=40){c.moveTo(x,0);c.lineTo(x,H)}for(let y=0;y<=H;y+=40){c.moveTo(0,y);c.lineTo(W,y)}c.stroke();
  c.fillStyle='#19e3ff22';c.strokeStyle='#19e3ff88';c.lineWidth=2;CORN.forEach(([x,y,sx,sy])=>{c.beginPath();c.moveTo(x,y);c.lineTo(x+70*sx,y);c.lineTo(x,y+70*sy);c.closePath();c.fill();c.stroke()});
  [[0,0],[W-10,1]].forEach(([x,t])=>{c.fillStyle=COL[t]+'66';c.fillRect(x,H/2-GH,10,GH*2)});
  c.save();c.shadowColor='#19e3ff';c.shadowBlur=12;c.strokeStyle='#8ff3ffcc';c.lineWidth=3;c.beginPath();
  c.moveTo(W/2,0);c.lineTo(W/2,H);c.moveTo(W/2+100,H/2);c.arc(W/2,H/2,100,0,7);
  c.rect(0,H/2-150,150,300);c.rect(W-150,H/2-150,150,300);c.stroke();c.restore();
  const sels=ctrls.map(k=>k.p.in.sel),mine=ctrls.flatMap(k=>k.p.rods);
  RODS.forEach((rd,i)=>{
    const r=G.rods[i],d=rd.t?-1:1,ex=r.kt>0?24*Math.sin(Math.PI*(1-r.kt/.2)):0,sl=sels.includes(i);
    c.fillStyle=sl?'#fff':mine.includes(i)?'#9fdcff':'#4a5a7a';
    c.save();if(sl){c.shadowColor='#fff';c.shadowBlur=14}c.fillRect(rd.x-(sl?4:2),0,sl?8:4,H);c.restore();
    c.save();c.shadowColor=COL[rd.t];c.shadowBlur=16;
    for(let j=0;j<rd.n;j++){
      const fx=rd.x+d*ex,fy=H/2+(j-(rd.n-1)/2)*rd.g+r.d;
      c.fillStyle='#071228';c.strokeStyle=COL[rd.t];c.lineWidth=3;
      c.beginPath();c.roundRect(fx-HW,fy-HH,HW*2,HH*2,6);c.fill();c.stroke();
      c.fillStyle=COL[rd.t];c.fillRect(fx-2,fy-HH+5,4,HH*2-10);
    }
    c.restore();
  });
  const b=G.d;(G.tr=G.tr||[]).push([b.x,b.y]);if(G.tr.length>8)G.tr.shift();
  G.tr.forEach((p,i)=>{c.fillStyle=`rgba(25,227,255,${i/25})`;c.beginPath();c.arc(p[0],p[1],R*i/9,0,7);c.fill()});
  c.save();c.shadowColor='#19e3ff';c.shadowBlur=20;c.fillStyle='#fff';c.beginPath();c.arc(b.x,b.y,R,0,7);c.fill();c.restore();
  c.fillStyle='#19e3ff';c.beginPath();c.arc(b.x,b.y,R/2.4,0,7);c.fill();
}
function hud(){
  $('#s0').textContent=G.sc[0];$('#s1').textContent=G.sc[1];
  const me=ctrls[0]&&ctrls[0].p;
  $('#info').textContent=G.ph=='goal'?'GOL! ⚽':mode=='online'&&me?`Você: Time ${TN[me.team]} · ${me.name}`:'';
  if(G.ph=='end'){$('#fim').style.display='flex';$('#vence').textContent=`Time ${TN[G.w]} venceu! 🏆`;
    $('#bRev').style.display=mode=='local'||isHost?'':'none'}
}

/* ---------- CONTROLES ---------- */
addEventListener('keydown',e=>{
  if(!G||down[e.code])return;
  if(e.code.startsWith('Arrow')||e.code=='Space')e.preventDefault();
  down[e.code]=1;
  ctrls.forEach(c=>{const i=c.p.in,k=c.k,a=c.p.rods;
    if(k.pv.includes(e.code)||k.nx.includes(e.code))i.mt=1.5,i.sel=a[(a.indexOf(i.sel)+(k.nx.includes(e.code)?1:-1)+a.length)%a.length];
    if(k.up.includes(e.code)||k.dn.includes(e.code))i.ty=null});
});
addEventListener('keyup',e=>down[e.code]=0);
addEventListener('blur',()=>{for(const k in down)down[k]=0});
function poll(){ctrls.forEach(c=>{const i=c.p.in,k=c.k,h=a=>a.some(x=>down[x]);
  i.mv=i.ty!=null?0:(h(k.dn)?1:0)-(h(k.up)?1:0);i.k=h(k.kk)||i.pk?1:0;
  i.mt=Math.max(0,(i.mt||0)-1/60);
  if(G&&!(i.mt>0)&&c.p.rods.length>1){const bx=G.b.x,ds=x=>Math.abs(RODS[x].x-bx);let best=c.p.rods[0];c.p.rods.forEach(x=>{if(ds(x)<ds(best))best=x});if(ds(best)+30<ds(i.sel))i.sel=best}})}
const cv=$('#cv');
function ptr(e){
  if(mode!='online'||!ctrls[0])return;
  const r=cv.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width,py=(e.clientY-r.top)*H/r.height,p=ctrls[0].p;
  p.in.ty=clamp(py-H/2,-300,300);p.in.mt=1.2;
  p.in.sel=p.rods.reduce((a,b)=>Math.abs(RODS[b].x-px)<Math.abs(RODS[a].x-px)?b:a);
}
cv.onpointermove=ptr;
cv.onpointerdown=e=>{try{cv.setPointerCapture(e.pointerId)}catch(x){}ptr(e);if(e.pointerType=='mouse'&&ctrls[0]&&mode=='online')ctrls[0].p.in.pk=1};
['pointerup','pointerleave','pointercancel'].forEach(ev=>cv.addEventListener(ev,e=>{if(e.pointerType=='mouse'&&ctrls[0])ctrls[0].p.in.pk=0}));
const kb=$('#kick');
kb.onpointerdown=()=>ctrls.forEach(c=>c.p.in.pk=1);
kb.onpointerup=kb.onpointerleave=()=>ctrls.forEach(c=>c.p.in.pk=0);

/* ---------- LOOP ---------- */
function loop(ts){
  requestAnimationFrame(loop);
  if(!G)return;
  const dt=Math.min(.05,(ts-last)/1000||0);last=ts;poll();fr++;
  const auth=mode=='local'||isHost;
  if(auth){
    acc+=dt;while(acc>=1/60){step(1/60);acc-=1/60}
    if(isHost&&fr%2==0){
      const m={t:'s',b:[G.b.x|0,G.b.y|0],v:[G.b.vx|0,G.b.vy|0],o:G.rods.map(r=>r.o|0),k:G.rods.map(r=>+r.kt.toFixed(2)),sc:G.sc,ph:G.ph,w:G.w};
      conns.forEach(c=>c.open&&c.send(m));
    }
  }else if(fr%2==0&&conn&&conn.open){const i=ctrls[0].p.in;conn.send({t:'in',sel:i.sel,mv:i.mv,ty:i.ty,k:i.k})}
  const f=auth?1:.5;
  if(!auth&&G.ph=='play'){G.b.x+=G.b.vx*dt;G.b.y=clamp(G.b.y+G.b.vy*dt,R,H-R)}
  G.rods.forEach(r=>r.d+=(r.o-r.d)*f);G.d.x+=(G.b.x-G.d.x)*f;G.d.y+=(G.b.y-G.d.y)*f;
  draw();hud();
}
requestAnimationFrame(loop);

/* ---------- LOCAL ---------- */
$('#bLoc').onclick=()=>{
  mode='local';newGame([{id:0,name:'Ciano',team:0},{id:1,name:'Magenta',team:1}]);
  ctrls=[{p:G.players[0],k:{up:['KeyW'],dn:['KeyS'],pv:['KeyA'],nx:['KeyD'],kk:['Space']}},
         {p:G.players[1],k:{up:['ArrowUp'],dn:['ArrowDown'],pv:['ArrowLeft'],nx:['ArrowRight'],kk:['Enter']}}];
  $('#ajuda').textContent='Ciano: W/S mover · A/D trocar barra · Espaço chutar   |   Magenta: ↑/↓ mover · ←/→ trocar barra · Enter chutar';
  show('jogo');
};

/* ---------- ONLINE ---------- */
$('#bOn').onclick=()=>show('online');
const rcode=()=>Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('');
function renderLobby(meta){
  $('#lista').innerHTML=meta.map(p=>`<li style="border-left:8px solid ${COL[p.team]}">${p.name}${p.id==0?' 👑':''}</li>`).join('');
  $('#bIni').style.display=isHost?'':'none';$('#bIni').disabled=meta.length<2;
  $('#espera').textContent=isHost?`${meta.length}/8 jogadores (mín. 2)`:'Aguardando o host iniciar...';
}
function pushLobby(){
  lobby.forEach((p,i)=>p.team=i%2);
  const meta=lobby.map(p=>({id:p.id,name:p.name,team:p.team}));
  lobby.forEach(p=>p.conn&&p.conn.open&&p.conn.send({t:'lobby',players:meta,you:p.id}));renderLobby(meta);
}
$('#bCriar').onclick=function create(){
  const code=rcode();goMenu();show('online');
  peer=new Peer('pebolim-'+code,{config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}]}});
  peer.on('open',()=>{isHost=true;mode='online';myId=0;lobby=[{id:0,name:nome(),conn:null}];$('#sala').textContent=code;show('lobby');pushLobby()});
  peer.on('error',e=>{if(e.type=='unavailable-id')create();else toast('Erro de conexão')});
  peer.on('connection',c=>{
    c.on('data',m=>{
      if(m.t=='join'){
        if(G||lobby.length>=8){c.send({t:'full'});return}
        c.pid=nextId++;lobby.push({id:c.pid,name:(m.name||'Jogador').slice(0,12),conn:c});conns.push(c);pushLobby();
      }else if(m.t=='in'&&G){const p=G.players.find(x=>x.id==c.pid);if(p)Object.assign(p.in,{sel:m.sel,mv:m.mv,ty:m.ty,k:m.k})}
    });
    c.on('close',()=>{const q=G&&G.players.find(x=>x.id==c.pid);if(q)Object.assign(q.in,{mv:0,ty:null,k:0,pk:0});lobby=lobby.filter(p=>p.conn!=c);conns=conns.filter(x=>x!=c);if(!G)pushLobby()});
  });
};
function enterGame(){
  ctrls=[{p:G.players.find(p=>p.id==myId),k:ALL}];
  $('#ajuda').textContent='Mouse/toque: mova para controlar a barra · clique ou botão CHUTAR · Teclado: W/S mover, A/D trocar barra, Espaço chutar';
  show('jogo');
}
function startGame(){
  newGame(lobby.map(p=>({id:p.id,name:p.name,team:p.team})));
  const m={t:'start',players:G.players.map(p=>({id:p.id,name:p.name,team:p.team}))};
  conns.forEach(c=>c.open&&c.send(m));enterGame();
}
$('#bIni').onclick=startGame;
$('#bRev').onclick=()=>{if(mode=='local')$('#bLoc').onclick();else if(isHost)startGame()};
$('#bEntrar').onclick=()=>{
  const code=$('#cod').value.trim().toUpperCase();if(code.length!=4)return toast('Digite o código da sala');
  const n=nome();goMenu();show('online');
  peer=new Peer(undefined,{config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}]}});
  peer.on('error',e=>{toast(e.type=='peer-unavailable'?'Sala não encontrada':'Erro de conexão');if(!conn)show('online')});
  peer.on('open',()=>{
    conn=peer.connect('pebolim-'+code);mode='online';
    conn.on('open',()=>conn.send({t:'join',name:n}));
    conn.on('close',()=>{toast('Conexão encerrada');goMenu()});
    conn.on('data',m=>{
      if(m.t=='lobby'){myId=m.you;$('#sala').textContent=code;show('lobby');renderLobby(m.players)}
      else if(m.t=='full'){toast('Sala cheia ou em jogo');goMenu()}
      else if(m.t=='start'){newGame(m.players);enterGame()}
      else if(m.t=='s'&&G){G.b.x=m.b[0];G.b.y=m.b[1];G.b.vx=m.v[0];G.b.vy=m.v[1];G.rods.forEach((r,i)=>{r.o=m.o[i];r.kt=m.k[i]});G.sc=m.sc;G.ph=m.ph;G.w=m.w}
    });
  });
};
