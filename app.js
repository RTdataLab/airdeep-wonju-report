/* ============================================================
   원주시설관리공단 월간 모니터링 리포트 — 차트 렌더링

   데이터 파일명은 아래 DATA_FILES 설정표에서 관리합니다.
   데이터팀이 보낸 CSV를 그 이름 그대로 data/ 폴더에 넣으면
   새로고침 시 리포트가 자동 갱신됩니다. (파일명이 바뀌면 설정표만 수정)
   ============================================================ */

let DAYS = Array.from({length:30},(_,i)=>`${i+1}`);
const BLUE = ['#2D6BFF','#E5484D','#22C55E','#F59E0B','#7C3AED','#0F766E','#BE185D','#78716C'];
const GRID = '#E5E9F0';
let HOLIDAYS = new Set();

/* ============================================================
   ✏️ 데이터 파일 설정표 — 데이터팀 파일명을 그대로 적으면 됩니다.
   매달 같은 이름으로 data/ 폴더에 넣으면 리포트가 자동 갱신됩니다.
   파일명이 바뀌면 아래 값만 고치세요. (CSV만 지원)
   ============================================================ */
const DATA_FILES = {
  temp:       '3-1.csv',  // 섹션3-1 — 구역별 일평균 실내온도
  sensorTemp: '3-2.csv',  // 섹션3-2 — 온습도계 설치 구역 온도
  operTotal:  '4-1.csv',  // 섹션4-1 — 구역별 누적 가동시간
  fac1:       '5-1.csv',  // 섹션5-1 — 종합운동장 공간별
  fac3:       '5-2.csv',  // 섹션5-2 — 치악체육관 공간별
  fac4:       '5-3.csv',  // 섹션5-3 — 국민체육센터 층별
  fac5:       '5-4.csv',  // 섹션5-4 — 종합체육관 공간별
  summary:    '6-1.csv',  // 섹션6-1 — 종합 분석표
  top5:       '6-2.csv',  // 섹션6-2 — 누적 가동시간 TOP5
};

function dataUrl(name){
  // CSV를 수정하면 항상 최신 데이터를 다시 불러오도록 매번 다른 값을 붙임
  return `data/${name}?v=${Date.now()}`;
}

/* ── CSV 파서 (따옴표 필드 지원) ───────────────────────────── */
function parseCSV(text){
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  return lines.map(line => {
    const cells = []; let cur = '', inQ = false;
    for(let i=0;i<line.length;i++){
      const c = line[i];
      if(inQ){
        if(c === '"'){ if(line[i+1] === '"'){ cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else {
        if(c === '"') inQ = true;
        else if(c === ','){ cells.push(cur); cur = ''; }
        else cur += c;
      }
    }
    cells.push(cur);
    return cells.map(s => s.trim());
  });
}

function num(v){
  if(v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function dayLabel(v){
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return String(Number(m[3]));
  return s;
}

/* ✏️ 공휴일 날짜 — 주말(토·일)은 자동 계산되고, 여기엔 공휴일만 적으면 됩니다.
   해당 날짜의 x축 라벨이 빨간색으로 표시됩니다. (매달 이 줄만 갱신) */
const PUBLIC_HOLIDAYS = ['2026-06-03']; // 제9회 전국동시지방선거

function isHolidayDate(v){
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return false;
  const day = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).getDay();
  return day === 0 || day === 6 || PUBLIC_HOLIDAYS.includes(s);
}

function tickColor(){
  return (ctx)=> HOLIDAYS.has(String(DAYS[ctx.index])) ? '#E5484D' : '#5B6577';
}

const X_TICKS = {
  maxRotation: 0,
  autoSkip: false,
  font: { size: 9 },
  color: tickColor()
};

function toSeriesMap(rows){
  const names = rows[0].slice(1);
  const map = {}; names.forEach(n => map[n] = []);
  const labels = [];
  for(let r=1;r<rows.length;r++){
    const label = dayLabel(rows[r][0]);
    labels.push(label);
    if(isHolidayDate(rows[r][0])) HOLIDAYS.add(label);
    names.forEach((n,ci)=> map[n].push(num(rows[r][ci+1])));
  }
  return { names, map, labels };
}

function toObjects(rows){
  const header = rows[0];
  return rows.slice(1).map(row=>{
    const o = {}; header.forEach((h,i)=> o[h] = row[i] ?? ''); return o;
  });
}

/* ── 차트 빌더 ─────────────────────────────────────────────── */
function mkLine(id, names, dataMap, colors, max, yLabel){
  const el = document.getElementById(id);
  if(!el) return;
  const isTemp = yLabel.includes('온도');
  new Chart(el,{
    type:'line',
    data:{labels:DAYS,datasets:names.map((n,i)=>({
      label:n,data:dataMap[n],borderColor:colors[i%colors.length],backgroundColor:colors[i%colors.length],
      pointRadius:0,pointHoverRadius:4,borderWidth:2.2,tension:.34,spanGaps:true
    }))},
    options:{
      responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        title:items=>`${items[0].label}일`,
        label:c=>`${c.dataset.label}: ${c.parsed.y}${isTemp?'℃':'h'}`
      }}},
      scales:{
        x:{grid:{display:false},ticks:X_TICKS},
        y:isTemp
          ? {min:14,max:30,ticks:{callback:v=>v+'℃',font:{size:9.5}},grid:{color:'#EEF1F6'}}
          : {beginAtZero:false,suggestedMax:max,grid:{color:GRID},title:{display:true,text:yLabel,font:{size:11,weight:'700'},color:'#1F2A44'}}
      }
    }
  });
}

function mkBar(id, labels, values, colors, unit='', horizontal=false){
  const el = document.getElementById(id);
  if(!el) return;
  new Chart(el,{
    type:'bar',
    data:{labels,datasets:[{data:values,backgroundColor:colors,borderRadius:8,borderSkipped:false}]},
    options:{
      indexAxis:horizontal?'y':'x',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed[horizontal?'x':'y']}${unit}`}}},
      scales:{
        x:{beginAtZero:true,grid:{display:false},ticks:{font:{size:11,weight:'600'},color:'#1F2A44'}},
        y:{beginAtZero:true,grid:{display:!horizontal,color:GRID},ticks:{font:{size:11,weight:'600'},color:'#1F2A44'}}
      }
    }
  });
}

/* 누적 가동시간 가로막대 + 막대 위 라벨(제어기수/일평균) */
function mkOperTotal(id, rows){
  const el = document.getElementById(id);
  if(!el) return;
  const sorted = [...rows].sort((a,b)=>b.total-a.total);
  const maxTotal = Math.max(...sorted.map(r=>r.total), 0);
  const xMax = Math.max(1000, Math.ceil((maxTotal * 1.35) / 500) * 500);
  const labelPlugin = {
    id:'operTotalLabels',
    afterDatasetsDraw(chart){
      const {ctx,chartArea,scales:{x}} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textBaseline = 'middle';
      sorted.forEach((row,i)=>{
        const bar = meta.data[i];
        if(!bar) return;
        const y = bar.y;
        const midX = x.getPixelForValue(row.total/2);
        const valueText = Number(row.total.toFixed(2)).toString();
        ctx.font = '700 10.5px Pretendard, sans-serif';
        if(row.total > 130){
          ctx.fillStyle = i===0 ? '#FFFFFF' : '#1F2A44';
          ctx.textAlign = 'center';
          ctx.fillText(valueText, midX, y);
        } else {
          ctx.fillStyle = '#1F2A44';
          ctx.textAlign = 'left';
          ctx.fillText(valueText, x.getPixelForValue(row.total)+6, y);
        }
        const auxText = `제어기 ${row.chartControllers ?? row.controllers} | 일평균 ${row.daily}h`;
        ctx.fillStyle = '#5B6577';
        ctx.font = '600 9.5px Pretendard, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(auxText, chartArea.right - 4, y);
      });
      ctx.restore();
    }
  };
  new Chart(el,{
    type:'bar',
    data:{labels:sorted.map(r=>r.zone),datasets:[{
      data:sorted.map(r=>r.total),
      backgroundColor:sorted.map((_,i)=>i===0?'#2D6BFF':'#2D6BFF55'),
      borderRadius:8, borderSkipped:false, barPercentage:.62, categoryPercentage:.78
    }]},
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      layout:{padding:{right:4}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>{
          const row = sorted[c.dataIndex];
          return `누적 ${row.total}h · 제어기 ${row.chartControllers ?? row.controllers} · 일평균 ${row.daily}h`;
        }}}
      },
      scales:{
        x:{beginAtZero:true,max:xMax,grid:{display:false},title:{display:true,text:'누적 가동시간(h)',font:{size:11,weight:'700'}},ticks:{callback:v=>Number(v).toLocaleString(),font:{size:10.5,weight:'600'},color:'#5B6577'}},
        y:{grid:{display:false},ticks:{font:{size:11,weight:'600'},color:'#5B6577'}}
      }
    },
    plugins:[labelPlugin]
  });
}

function mkTop5(canvasId, bodyId, rows, color, mode){
  const ctx = document.getElementById(canvasId);
  if(ctx){
    new Chart(ctx,{
      type:'bar',
      data:{labels:rows.map(r=>r.p),datasets:[{data:rows.map(r=>r.t),backgroundColor:color,borderRadius:6,borderSkipped:false}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.x}h`}}},
        scales:{x:{beginAtZero:true,grid:{display:false}},y:{grid:{display:false},ticks:{font:{size:10,weight:'600'}}}}
      }
    });
  }
  const b = document.getElementById(bodyId);
  if(b){
    b.innerHTML = rows.map((r,i)=>`<tr><td>${i===0?'<span class="rk1">1</span>':`<span class="rkn">${i+1}</span>`}</td><td>${r.p}</td><td>${r.t.toFixed(2)}</td><td>${mode==='under'?r.ratio+'%':r.e+'대'}</td><td>${mode==='under'?r.avg.toFixed(1)+'℃':r.a+'h'}</td></tr>`).join('');
  }
}

function showError(msg){
  const bar = document.querySelector('.print-bar');
  const div = document.createElement('div');
  div.style.cssText = 'background:#FEECEC;border:1px solid #E5484D;color:#B91C1C;padding:14px 18px;border-radius:10px;margin-bottom:16px;font-size:13px;line-height:1.6';
  div.innerHTML = `<strong>데이터를 불러오지 못했습니다.</strong><br>${msg}<br><span style="color:#7A1F1F;font-size:12px">로컬 서버에서 열었는지(예: <code>python -m http.server</code>), data 폴더의 CSV 파일이 있는지 확인해 주세요.</span>`;
  if(bar && bar.parentNode) bar.parentNode.insertBefore(div, bar.nextSibling);
  else document.body.prepend(div);
}

/* ── 메인 ──────────────────────────────────────────────────── */
async function main(){
  Chart.defaults.font.family = "'Pretendard Variable',Pretendard,-apple-system,system-ui,sans-serif";
  Chart.defaults.color = '#5B6577';

  const keys = ['temp','sensorTemp','operTotal','fac1','fac3','fac4','fac5','summary','top5'];
  let txt = {};
  try {
    const res = await Promise.all(keys.map(k => fetch(dataUrl(DATA_FILES[k]))));
    res.forEach((r,i)=>{ if(!r.ok) throw new Error(`${DATA_FILES[keys[i]]} 응답 오류 (HTTP) — data 폴더의 파일명을 확인하세요`); });
    const texts = await Promise.all(res.map(r=>r.text()));
    keys.forEach((k,i)=> txt[k] = texts[i]);
  } catch(e){ showError(e.message); return; }

  let temp, sensorTemp, fac1, fac3, fac4, fac5, operTotalRows, summary, top5Rows;
  try {
    temp          = toSeriesMap(parseCSV(txt.temp));
    sensorTemp    = toSeriesMap(parseCSV(txt.sensorTemp));
    fac1          = toSeriesMap(parseCSV(txt.fac1));
    fac3          = toSeriesMap(parseCSV(txt.fac3));
    fac4          = toSeriesMap(parseCSV(txt.fac4));
    fac5          = toSeriesMap(parseCSV(txt.fac5));
    operTotalRows = toObjects(parseCSV(txt.operTotal));
    summary       = toObjects(parseCSV(txt.summary));
    top5Rows      = toObjects(parseCSV(txt.top5));
    DAYS = temp.labels.length ? temp.labels : DAYS;
  } catch(e){ showError('CSV 파싱 중 오류: ' + e.message); return; }

  /* 3. 구역별 실내온도 */
  mkLine('c-all-temp', temp.names, temp.map, BLUE, 28, '일평균 실내온도');
  mkLine('c-outdoor-vs', sensorTemp.names, sensorTemp.map, BLUE, 28, '온습도계 측정 온도');

  /* 5. 시설별 상세 가동시간 — 시설별 1파일(5-1·5-2·5-3·5-4) */
  mkLine('c-main-oper',  fac1.names, fac1.map, BLUE, 9,  '일평균 가동시간'); // 5-1 종합운동장
  mkLine('c-park-oper',  fac3.names, fac3.map, BLUE, 7,  '일평균 가동시간'); // 5-2 치악체육관
  mkLine('c-gym-oper',   fac4.names, fac4.map, BLUE, 3,  '일평균 가동시간'); // 5-3 국민체육센터
  mkLine('c-park2-oper', fac5.names, fac5.map, BLUE, 25, '일평균 가동시간'); // 5-4 종합체육관

  /* 섹션4·6 — 데이터팀 파일에서 직접 구성
     판정/조치는 누적시간·평균온도 기준으로 자동 생성 */
  function autoJudge(zone, total, avgTemp){
    if(zone === 'DB숙소') return { judge:'risk', action:`월 누적 ${total.toFixed(1)}h로 1위이고 평균 ${avgTemp.toFixed(1)}℃입니다. 상시 가동 공간과 설정온도 기준을 우선 점검` };
    if(zone === '국민체육센터') return { judge:'risk', action:`월 누적 ${total.toFixed(1)}h로 2위입니다. 2층 고온 구간과 지하·1층 반복 가동을 분리해 점검` };
    if(zone === '종합체육관') return { judge:'risk', action:`월 누적 ${total.toFixed(1)}h이며 제어기당 일평균이 가장 높습니다. 사무실·휴게공간 반복 가동 확인` };
    if(zone === '치악체육관') return { judge:'warn', action:`평균 ${avgTemp.toFixed(1)}℃로 낮은 편입니다. 휴게공간 중심의 저온 구간과 이용시간대를 확인` };
    if(total >= 600)    return { judge:'risk', action:'누적 가동시간이 가장 높은 수준으로 장시간 운전일과 상시 가동 공간을 우선 점검' };
    if(avgTemp >= 25)   return { judge:'warn', action:'평균 실내온도가 높은 편이므로 냉방 설정온도와 야간 운전 기준을 점검' };
    if(total >= 300)    return { judge:'warn', action:'가동 시간이 높은 편이므로 이용 종료 후 잔여 가동 여부를 점검' };
    return { judge:'ok', action:'현재 안정적으로 운영 중으로 현 수준 유지' };
  }

  /* 누적 가동시간 + 제어기수 + 제어기당 일평균 (4-1.csv) */
  const operByZone = {};
  const operTotal = operTotalRows.map(r=>{
    const zone = r['구역'];
    const ctrl = num(r['제어기_대수']) ?? num(r['제어기수']) ?? num(r['제어기']) ?? 0;
    const o = {
      zone,
      total: num(r['월누적_가동시간_시간']) ?? num(r['누적가동시간']) ?? num(r['총가동']) ?? 0,
      controllers: ctrl,
      chartControllers: ctrl,
      daily: num(r['제어기1대당_하루평균_가동시간_시간']) ?? num(r['제어기당_일평균가동시간']) ?? num(r['일평균']) ?? 0
    };
    operByZone[zone] = o;
    return o;
  }).filter(r=>r.zone);

  /* 섹션4-1: 누적 가동시간 가로막대 */
  mkOperTotal('c-oper-avg', operTotal);

  /* 섹션6: 종합 분석표 (6-1.csv) */
  const tbody = document.querySelector('#summaryTable tbody');
  if(tbody){
    const tableRows = summary.map(r=>{
      const zone = r['구역'];
      const total = num(r['월 가동시간']) ?? num(r['월가동시간']) ?? (operByZone[zone]?.total) ?? 0;
      const avgTemp = num(r['평균온도']) ?? 0;
      const { judge, action } = autoJudge(zone, total, avgTemp);
      return { zone, total, avgTemp, judge, action };
    }).filter(r=>r.zone).sort((a,b)=>b.total-a.total);
    tbody.innerHTML = tableRows.map((r,i)=>{
      const cls = r.judge==='risk'?'risk':r.judge==='warn'?'warn-txt':'ok-txt';
      const label = r.judge==='risk'?'우선 점검':r.judge==='warn'?'보정 필요':'유지';
      return `<tr><td class="num sum-rank">${i+1}</td><td class="sum-zone">${r.zone}</td><td class="num sum-hours">${r.total.toFixed(2)}h</td><td class="num sum-temp">${r.avgTemp.toFixed(2)}℃</td><td class="sum-judge ${cls}">${label}</td><td class="sum-action">${r.action}</td></tr>`;
    }).join('');
  }

  /* 섹션6: TOP5 (6-2.csv) */
  const TOP_TOTAL = top5Rows.map(r=>({
    p: r['구역'],
    t: num(r['월누적가동시간_시간']) ?? num(r['총(H)']) ?? num(r['총']) ?? num(r['총가동']) ?? 0,
    e: num(r['제어기수']) ?? num(r['장비']) ?? num(r['제어기']) ?? 0,
    a: num(r['제어기당_하루평균가동시간_시간']) ?? num(r['제어기당_일평균가동시간']) ?? num(r['일평균']) ?? num(r['하루평균가동시간_시간']) ?? num(r['하루평균']) ?? 0
  })).filter(r=>r.p).sort((a,b)=>b.t-a.t).slice(0,5);
  mkTop5('c-t5in','t5inB',TOP_TOTAL,'#2D6BFF','total');
}

window.addEventListener('DOMContentLoaded', main);

/* ── 인쇄: 리포트 전체를 세로로 긴 '한 페이지' PDF로 출력 ─────
   인쇄 직전에 문서 높이를 측정해 그 크기의 커스텀 용지를 적용한다.
   크롬 인쇄 대화상자에서 [대상: PDF로 저장] 그대로 출력하면 됨. */
let PRINT_MODE = 'one'; // 'one' = 한 장 PDF · 'a4' = A4 여러 장
function setPageRule(){
  let st = document.getElementById('one-page-print');
  if(!st){ st = document.createElement('style'); st.id = 'one-page-print'; document.head.appendChild(st); }
  if(PRINT_MODE === 'a4'){
    st.textContent = '@page { size: A4 portrait; margin: 10mm; }';
    document.body.classList.add('print-a4');
  } else {
    const PX2MM = 25.4 / 96;
    const page = document.querySelector('.page') || document.body;
    const wMm = Math.ceil(page.offsetWidth * PX2MM) + 20;
    const hMm = Math.ceil(document.documentElement.scrollHeight * PX2MM) + 12;
    st.textContent = `@page { size: ${wMm}mm ${hMm}mm; margin: 10mm; }`;
    document.body.classList.remove('print-a4');
  }
}
function printOnePage(){ PRINT_MODE = 'one'; setPageRule(); window.print(); }
function printA4(){ PRINT_MODE = 'a4'; setPageRule(); window.print(); }
window.addEventListener('load', () => setTimeout(setPageRule, 400));
window.addEventListener('beforeprint', setPageRule);
window.addEventListener('afterprint', () => { PRINT_MODE = 'one'; setPageRule(); });
