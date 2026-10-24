/* 사진 편집 도구: 합성 사진 위 개체를 선택·이동·크기 조절·재편집 */
(() => {
  'use strict';
  const E = window.Editor, work = E.work, wctx = work.getContext('2d');
  const $ = id => document.getElementById(id);
  const frame = $('frame'), ov = $('ov'), octx = ov.getContext('2d');
  const opts = $('opts'), txt = $('txt'), font = $('font'), sz = $('sz'), szl = $('szl');
  const fillBox = $('fill'), col = $('col'), tip = $('tip'), sw = $('swatches');
  const rows = { text: $('rowText'), shape: $('rowShape'), color: $('rowColor') };
  const toolBtns = document.querySelectorAll('[data-tool]');
  const COLORS = ['#ff3b30','#ff9500','#ffcc00','#34c759','#0a84ff','#af52de','#ffffff','#000000'];
  const CFG = {
    text:{label:'글자 크기',min:8,max:100,v:30},
    arrow:{label:'굵기',min:2,max:30,v:6},
    shape:{label:'굵기',min:1,max:30,v:5},
    mosaic:{label:'모자이크 강도',min:4,max:50,v:12},
    image:{label:'사진 크기',min:10,max:100,v:100}
  };
  const TIPS = {
    text:'사진을 눌러 글자를 추가하세요. 선택한 글자는 아래 입력창에서 다시 편집할 수 있습니다.',
    arrow:'사진을 끌어 화살표를 그리세요. 선택 후 끝점을 끌면 방향을 바꿀 수 있습니다.',
    shape:'사진을 끌어 도형을 그리세요. 선택 후 모서리를 끌어 크기를 바꾸세요.',
    mosaic:'가릴 부분을 끌어 지정하세요. 선택 후 이동·크기 조절이 가능합니다.',
    image:'선택한 사진을 끌어 이동하거나 모서리 손잡이로 크기를 조절하세요.'
  };
  let tool=null, act=null, drag=null, color=COLORS[0], shape='rect';
  let objects=[];
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const U=()=>Math.max(work.width,work.height)/500;
  const K=()=>work.width/(frame.clientWidth||work.width);
  const box=o=>({x:Math.min(o.x1,o.x2),y:Math.min(o.y1,o.y2),w:Math.abs(o.x2-o.x1),h:Math.abs(o.y2-o.y1)});
  const fontStr=o=>`${o.size}px "${o.font}", sans-serif`;
  const textBox=o=>{octx.font=fontStr(o);return{x:o.x1,y:o.y1,w:Math.max(octx.measureText(o.text||' ').width,8*U()),h:o.size*1.25};};
  const pt=e=>{const r=ov.getBoundingClientRect();return{x:(e.clientX-r.left)*work.width/r.width,y:(e.clientY-r.top)*work.height/r.height};};

  function mosaic(c,b,n){
    const x=Math.max(0,b.x),y=Math.max(0,b.y);
    const w=Math.min(work.width,b.x+b.w)-x,h=Math.min(work.height,b.y+b.h)-y;
    if(w<2||h<2)return;
    const t=document.createElement('canvas');t.width=Math.max(1,Math.ceil(w/n));t.height=Math.max(1,Math.ceil(h/n));
    t.getContext('2d').drawImage(work,x,y,w,h,0,0,t.width,t.height);
    c.save();c.imageSmoothingEnabled=false;c.drawImage(t,0,0,t.width,t.height,x,y,w,h);c.restore();
  }
  function drawObj(c,o){
    c.save();c.lineWidth=o.lw||1;c.lineCap=c.lineJoin='round';c.strokeStyle=c.fillStyle=o.color||'#ff3b30';
    const b=box(o);
    if(o.type==='image' && o.img){c.drawImage(o.img,b.x,b.y,Math.max(1,b.w),Math.max(1,b.h));}
    else if(o.type==='mosaic') mosaic(c,b,o.block||12);
    else if(o.type==='rect'){if(o.fill)c.fillRect(b.x,b.y,b.w,b.h);else c.strokeRect(b.x,b.y,b.w,b.h);}
    else if(o.type==='ellipse'){c.beginPath();c.ellipse(b.x+b.w/2,b.y+b.h/2,Math.max(1,b.w/2),Math.max(1,b.h/2),0,0,Math.PI*2);if(o.fill)c.fill();else c.stroke();}
    else if(o.type==='arrow'){
      const a=Math.atan2(o.y2-o.y1,o.x2-o.x1),L=(o.lw||1)*3.5+10;
      c.beginPath();c.moveTo(o.x1,o.y1);c.lineTo(o.x2-Math.cos(a)*L*.6,o.y2-Math.sin(a)*L*.6);c.stroke();
      c.beginPath();c.moveTo(o.x2,o.y2);c.lineTo(o.x2-L*Math.cos(a-.45),o.y2-L*Math.sin(a-.45));c.lineTo(o.x2-L*Math.cos(a+.45),o.y2-L*Math.sin(a+.45));c.closePath();c.fill();
    } else if(o.type==='text'){
      c.font=fontStr(o);c.textBaseline='top';c.fillText(o.text||'',o.x1,o.y1);
    }
    c.restore();
  }
  function handles(o){
    if(o.type==='arrow')return[[o.x1,o.y1,'a'],[o.x2,o.y2,'b']];
    if(o.type==='text'){const t=textBox(o);return[[t.x+t.w,t.y+t.h,'se']];}
    const b=box(o);return[[b.x,b.y,'nw'],[b.x+b.w,b.y,'ne'],[b.x,b.y+b.h,'sw'],[b.x+b.w,b.y+b.h,'se']];
  }
  function draw(){
    if(ov.width!==work.width||ov.height!==work.height){ov.width=work.width;ov.height=work.height;}
    octx.clearRect(0,0,ov.width,ov.height);
    objects.forEach(o=>drawObj(octx,o));
    if(!act)return;
    const k=K();
    octx.save();octx.lineWidth=2*k;octx.strokeStyle='#6aa9ff';octx.setLineDash([6*k,4*k]);
    if(act.type==='text'){const t=textBox(act);octx.strokeRect(t.x-4*k,t.y-4*k,t.w+8*k,t.h+8*k);}
    else if(act.type!=='arrow'){const b=box(act);octx.strokeRect(b.x,b.y,b.w,b.h);}
    octx.setLineDash([]);octx.fillStyle='#fff';
    handles(act).forEach(([x,y])=>{octx.beginPath();octx.arc(x,y,11*k,0,Math.PI*2);octx.fill();octx.stroke();});
    octx.restore();
  }
  function sync(){draw();}
  function drawTo(c){objects.forEach(o=>drawObj(c,o));}
  function apply(o){
    const v=+sz.value*U();o.color=color;o.fill=fillBox.checked;
    if(o.type==='text'){o.size=o.size||v;o.text=txt.value;o.font=font.value;}
    else if(o.type==='mosaic')o.block=v;
    else o.lw=v;
  }
  function loadFont(o){if(o.type==='text'&&document.fonts)document.fonts.load(fontStr(o),o.text||'A가').then(draw,()=>{});}
  function upd(){if(act){apply(act);loadFont(act);draw();}}
  function showOpts(){
    opts.hidden=!tool;if(!tool)return;
    const c=CFG[tool]||CFG.shape;
    rows.text.hidden=tool!=='text';rows.shape.hidden=tool!=='shape';rows.color.hidden=tool==='mosaic'||tool==='image';
    szl.hidden=tool==='image';sz.hidden=tool==='image';
    szl.textContent=c.label;sz.min=c.min;sz.max=c.max;
    sz.value=act?(tool==='text'?Math.round(act.size/U()):Math.round((tool==='mosaic'?act.block:(act.lw||c.v))/U())):c.v;
    if(act&&act.type==='text'){txt.value=act.text;font.value=act.font;col.value=act.color||color;}
    else if(act){fillBox.checked=!!act.fill;col.value=act.color||color;}
    tip.textContent=TIPS[tool]||'사진 위에서 개체를 배치하세요.';
  }
  function typeFor(o){return o.type==='rect'||o.type==='ellipse'?'shape':o.type;}
  function setTool(t){
    tool=t;frame.classList.toggle('tooling',!!t);
    toolBtns.forEach(b=>b.classList.toggle('on',b.dataset.tool===t));
    showOpts();draw();
  }
  function commit(){if(!act)return;act=null;draw();}
  function bake(){
    objects.forEach(o=>drawObj(wctx,o));
    objects=[];act=null;drag=null;draw();
  }
  function hit(o,p,k){
    const pad=14*k;
    if(o.type==='text'){const t=textBox(o);return p.x>=t.x-pad&&p.x<=t.x+t.w+pad&&p.y>=t.y-pad&&p.y<=t.y+t.h+pad;}
    if(o.type==='arrow'){const dx=o.x2-o.x1,dy=o.y2-o.y1,l2=dx*dx+dy*dy||1;const t=clamp(((p.x-o.x1)*dx+(p.y-o.y1)*dy)/l2,0,1);return Math.hypot(p.x-(o.x1+t*dx),p.y-(o.y1+t*dy))<pad+(o.lw||1);}
    const b=box(o);return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;
  }
  function selectObject(o){
    act=o;setTool(typeFor(o));
    if(o.type==='text'){txt.value=o.text;font.value=o.font;}
    showOpts();
  }
  ov.addEventListener('pointerdown',e=>{
    if(!tool)return;
    const p=pt(e),k=K();
    const h=act&&handles(act).find(([x,y])=>Math.hypot(x-p.x,y-p.y)<26*k);
    if(h){drag={m:h[2],start:{...act},p};}
    else if(act&&hit(act,p,k)){drag={m:'move',p,start:{...act}};}
    else {
      const found=[...objects].reverse().find(o=>hit(o,p,k));
      if(found){selectObject(found);drag={m:'move',p,start:{...found}};}
      else if(tool==='image'){act=null;draw();return;}
      else if(tool==='text'){
        const o={type:'text',x1:p.x,y1:p.y,x2:p.x,y2:p.y,text:txt.value||'텍스트',font:font.value,size:+sz.value*U(),color,fill:false,lw:1};
        objects.push(o);act=o;loadFont(o);showOpts();drag={m:'move',p,start:{...o}};
      } else {
        const type=tool==='shape'?shape:tool;
        const o={type,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color,fill:fillBox.checked,lw:+sz.value*U(),block:+sz.value*U()};
        objects.push(o);act=o;drag={m:type==='arrow'?'b':'se',p,start:{...o}};
      }
    }
    ov.setPointerCapture(e.pointerId);e.preventDefault();draw();
  });
  ov.addEventListener('pointermove',e=>{
    if(!drag||!act)return;
    const p=pt(e),o=act,m=drag.m,s=drag.start;
    if(m==='move'){const dx=p.x-drag.p.x,dy=p.y-drag.p.y;o.x1=s.x1+dx;o.y1=s.y1+dy;o.x2=s.x2+dx;o.y2=s.y2+dy;}
    else {
      const x=clamp(p.x,0,work.width),y=clamp(p.y,0,work.height);
      if(o.type==='arrow'){if(m==='a'){o.x1=x;o.y1=y;}else{o.x2=x;o.y2=y;}}
      else if(o.type==='text'){
        const t=textBox(o);const ratio=Math.max(.35,Math.min(5,(x-o.x1)/Math.max(1,t.w)));o.size=clamp(s.size*ratio,8*U(),250*U());
      } else {
        if(m.includes('w'))o.x1=x;else o.x2=x;
        if(m.includes('n'))o.y1=y;else o.y2=y;
      }
    }
    draw();
  });
  const end=()=>{if(drag){drag=null;showOpts();draw();}};
  ov.addEventListener('pointerup',end);ov.addEventListener('pointercancel',end);

  COLORS.forEach((c,i)=>{const b=document.createElement('button');b.className='sw'+(i?'':' on');b.style.background=c;b.setAttribute('aria-label',c);b.addEventListener('click',()=>pick(c));sw.appendChild(b);});
  function pick(c){color=c;col.value=c;sw.querySelectorAll('.sw').forEach((b,i)=>b.classList.toggle('on',COLORS[i]===c));if(act){act.color=c;draw();}}
  col.addEventListener('input',()=>pick(col.value));
  rows.shape.querySelectorAll('[data-shape]').forEach(b=>b.addEventListener('click',()=>{shape=b.dataset.shape;rows.shape.querySelectorAll('[data-shape]').forEach(x=>x.classList.toggle('on',x===b));if(act&&(act.type==='rect'||act.type==='ellipse'))act.type=shape;draw();}));
  txt.addEventListener('input',()=>{if(act&&act.type==='text'){act.text=txt.value;loadFont(act);draw();}});
  font.addEventListener('change',()=>{if(act&&act.type==='text'){act.font=font.value;loadFont(act);draw();}});
  fillBox.addEventListener('change',()=>{if(act){act.fill=fillBox.checked;draw();}});
  sz.addEventListener('input',()=>{if(!tool)return;CFG[tool].v=+sz.value;if(act){const v=+sz.value*U();if(act.type==='text')act.size=v;else if(act.type==='mosaic')act.block=v;else act.lw=v;draw();}});
  toolBtns.forEach(b=>b.addEventListener('click',()=>setTool(tool===b.dataset.tool?null:b.dataset.tool)));
  $('optDone').addEventListener('click',commit);
  $('optDel').addEventListener('click',()=>{if(act)objects=objects.filter(o=>o!==act);act=null;draw();});
  window.Tools={
    sync,
    drawTo,
    setImages(images){
      objects=[];
      const list=Array.from(images||[]);
      list.forEach((img,i)=>{
        let iw,ih,x,y;
        if(i===0){iw=work.width;ih=work.height;x=0;y=0;}
        else{
          const fit=Math.min((work.width*.68)/img.naturalWidth,(work.height*.68)/img.naturalHeight,1);
          iw=Math.max(1,Math.round(img.naturalWidth*fit));ih=Math.max(1,Math.round(img.naturalHeight*fit));
          const offset=Math.min(i*18,Math.min(work.width,work.height)*.12);
          x=clamp(Math.round((work.width-iw)/2+(i%2?offset:-offset)),0,Math.max(0,work.width-iw));
          y=clamp(Math.round((work.height-ih)/2+(i%2?-offset:offset)),0,Math.max(0,work.height-ih));
        }
        objects.push({type:'image',img,x1:x,y1:y,x2:x+iw,y2:y+ih,color:'#ffffff',fill:false,lw:1});
      });
      act=null;setTool('image');draw();
    },
    stop(){commit();setTool(null);},
    cancel(){if(act){act=null;draw();return true;}return false;},
    reset(){act=null;drag=null;objects=[];setTool(null);toolBtns.forEach(b=>{b.disabled=false;});sync();},
    bake
  };
})();