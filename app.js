/* ============================================================
   원주시설관리공단 월간 모니터링 리포트 — 차트 렌더링

   데이터 파일명은 아래 DATA_FILES 설정표에서 관리합니다.
   데이터팀이 보낸 CSV를 그 이름 그대로 data/ 폴더에 넣으면
   새로고침 시 리포트가 자동 갱신됩니다. (파일명이 바뀌면 설정표만 수정)
   ============================================================ */

let DAYS = Array.from({length:31},(_,i)=>`${i+1}`);
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
  days:       '4-1.csv',  // 섹션4-1 — 구역별 가동일수
  operTotal:  '4-2.csv',  // 섹션4-2 — 구역별 누적 가동시간
  fac1:       '5-1.csv',  // 섹션5-1 — 종합운동장 공간별
  dbPie:      '5-2.csv',  // 섹션5-2 — DB숙소 구분별 비중(파이)
  fac3:       '5-3.csv',  // 섹션5-3 — 치악체육관 공간별
  fac4:       '5-4.csv',  // 섹션5-4 — 국민체육센터 층별
  fac5:       '5-5.csv',  // 섹션5-5 — 종합체육관 공간별
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
const PUBLIC_HOLIDAYS = ['2026-05-01', '2026-05-05', '2026-05-25']; // 근로자의날 · 어린이날 · 대체공휴일

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
        x:{grid:{display:!isTemp,color:GRID},ticks:{
          maxRotation:0,
          autoSkip:!isTemp,
          maxTicksLimit:isTemp ? undefined : 10,
          font:{size:isTemp ? 9 : 10.5},
          color:isTemp ? tickColor() : '#5B6577'
        }},
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
        x:{beginAtZero:true,grid:{display:horizontal,color:GRID},ticks:{font:{size:11,weight:'600'},color:'#1F2A44'}},
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
        x:{beginAtZero:true,max:xMax,grid:{color:GRID},title:{display:true,text:'누적 가동시간(h)',font:{size:11,weight:'700'}},ticks:{callback:v=>Number(v).toLocaleString(),font:{size:10.5,weight:'600'},color:'#5B6577'}},
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
  // datalabels는 전역 등록되므로 기본값을 숨김으로 두고, 파이차트에서만 켠다(라인/막대 깔끔 유지)
  if(typeof ChartDataLabels !== 'undefined' && Chart.defaults.plugins){
    Chart.defaults.plugins.datalabels = { display: false };
  }

  const keys = ['temp','sensorTemp','days','operTotal','fac1','dbPie','fac3','fac4','fac5','summary','top5'];
  let txt = {};
  try {
    const res = await Promise.all(keys.map(k => fetch(dataUrl(DATA_FILES[k]))));
    res.forEach((r,i)=>{ if(!r.ok) throw new Error(`${DATA_FILES[keys[i]]} 응답 오류 (HTTP) — data 폴더의 파일명을 확인하세요`); });
    const texts = await Promise.all(res.map(r=>r.text()));
    keys.forEach((k,i)=> txt[k] = texts[i]);
  } catch(e){ showError(e.message); return; }

  let temp, sensorTemp, fac1, fac3, fac4, fac5, operTotalRows, daysRowsRaw, summary, dbPie, top5Rows;
  try {
    temp          = toSeriesMap(parseCSV(txt.temp));
    sensorTemp    = toSeriesMap(parseCSV(txt.sensorTemp));
    fac1          = toSeriesMap(parseCSV(txt.fac1));
    fac3          = toSeriesMap(parseCSV(txt.fac3));
    fac4          = toSeriesMap(parseCSV(txt.fac4));
    fac5          = toSeriesMap(parseCSV(txt.fac5));
    operTotalRows = toObjects(parseCSV(txt.operTotal));
    daysRowsRaw   = toObjects(parseCSV(txt.days));
    summary       = toObjects(parseCSV(txt.summary));
    dbPie         = toObjects(parseCSV(txt.dbPie));
    top5Rows      = toObjects(parseCSV(txt.top5));
    DAYS = temp.labels.length ? temp.labels : DAYS;
  } catch(e){ showError('CSV 파싱 중 오류: ' + e.message); return; }

  /* 3. 구역별 실내온도 */
  mkLine('c-all-temp', temp.names, temp.map, BLUE, 28, '일평균 실내온도');
  mkLine('c-outdoor-vs', sensorTemp.names, sensorTemp.map, BLUE, 28, '온습도계 측정 온도');

  /* 5. 시설별 상세 가동시간 — 시설별 1파일(5-1·5-3·5-4·5-5) */
  mkLine('c-main-oper',  fac1.names, fac1.map, BLUE, 4,  '일평균 가동시간'); // 5-1 종합운동장
  mkLine('c-park-oper',  fac3.names, fac3.map, BLUE, 7,  '일평균 가동시간'); // 5-3 치악체육관
  mkLine('c-gym-oper',   fac4.names, fac4.map, BLUE, 3,  '일평균 가동시간'); // 5-4 국민체육센터
  mkLine('c-park2-oper', fac5.names, fac5.map, BLUE, 16, '일평균 가동시간'); // 5-5 종합체육관

  /* 5-2 DB숙소: 구분별 총 가동시간 비중 (파이차트) */
  const elPie = document.getElementById('c-dg-oper');
  if(elPie){
    const pieRows = dbPie.map(r=>({
      name: r['구분'] ?? r['DB숙소_구분'] ?? '',
      total: num(r['총가동시간']) ?? num(r['총가동시간_시간']) ?? 0,
      daily: num(r['하루평균']) ?? num(r['하루평균가동시간_시간'])
    }));
    const pieColors = ['#2D6BFF','#C7D6F5','#F59E0B','#22C55E','#7C3AED'];
    const sumTotal = pieRows.reduce((s,r)=>s+r.total,0) || 1;
    new Chart(elPie,{
      type:'doughnut',
      plugins: typeof ChartDataLabels === 'undefined' ? [] : [ChartDataLabels],
      data:{labels:pieRows.map(r=>r.name),datasets:[{
        data:pieRows.map(r=>r.total),
        backgroundColor:pieRows.map((_,i)=>pieColors[i%pieColors.length]),
        borderColor:'#FFFFFF', borderWidth:2
      }]},
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'58%',
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:c=>{
            const r = pieRows[c.dataIndex];
            const pct = (r.total/sumTotal*100).toFixed(1);
            const dailyTxt = r.daily!=null ? ` · 하루평균 ${r.daily}h` : '';
            return ` ${r.name}: ${r.total}h (${pct}%)${dailyTxt}`;
          }}},
          datalabels:{
            color: ctx => {
              const bg = pieColors[ctx.dataIndex % pieColors.length];
              return bg === '#C7D6F5' ? '#1F2A44' : '#fff';
            },
            font:{ size:11, weight:'700', family:"'Pretendard Variable',Pretendard,sans-serif" },
            formatter:(value, ctx)=>{
              const r = pieRows[ctx.dataIndex];
              const pct = (value / sumTotal * 100).toFixed(1);
              return `${r.name}\n${r.total}h\n${pct}%`;
            },
            textAlign:'center',
            display: ctx => (ctx.dataset.data[ctx.dataIndex] / sumTotal) > 0.05
          }
        }
      }
    });
  }

  /* 섹션4·6 — 데이터팀 파일에서 직접 구성
     판정/조치는 누적시간·평균온도 기준으로 자동 생성 */
  function autoJudge(total, avgTemp){
    if(total >= 1000)   return { judge:'risk', action:'누적 가동시간이 가장 높아 장시간 운전일을 우선 점검하고 종료 스케줄을 분리 관리' };
    if(avgTemp >= 25)   return { judge:'warn', action:'평균 실내온도가 높은 편이므로 냉방 설정온도와 가동 시간대를 점검' };
    if(total >= 300)    return { judge:'warn', action:'가동 시간이 높은 편이므로 이용 종료 후 잔여 가동 여부를 점검' };
    return { judge:'ok', action:'현재 안정적으로 운영 중으로 현 수준 유지' };
  }

  /* 가동일/가동률 (days.csv) */
  const daysByZone = {};
  daysRowsRaw.forEach(r=>{ daysByZone[r['구역']] = num(r['가동일']) ?? num(r['가동일수']) ?? 0; });

  /* 누적 가동시간 + 제어기수 + 제어기당 일평균 (4-2.csv) */
  const operByZone = {};
  const operTotal = operTotalRows.map(r=>{
    const zone = r['구역'];
    const ctrl = num(r['제어기수']) ?? num(r['제어기']) ?? 0;
    const o = {
      zone,
      total: num(r['누적가동시간']) ?? num(r['총가동']) ?? 0,
      controllers: ctrl,
      chartControllers: ctrl,
      daily: num(r['제어기당_일평균가동시간']) ?? num(r['일평균']) ?? 0
    };
    operByZone[zone] = o;
    return o;
  }).filter(r=>r.zone);

  /* 섹션4 좌: 가동일수 막대 */
  const daysRows = operTotal.map(o=>({ zone:o.zone, days:daysByZone[o.zone] ?? 0 }))
                            .sort((a,b)=>b.days-a.days);
  mkBar('c-oper-days', daysRows.map(r=>r.zone), daysRows.map(r=>r.days), daysRows.map((_,i)=>BLUE[i%BLUE.length]), '일');

  /* 섹션4 우: 누적 가동시간 가로막대 */
  mkOperTotal('c-oper-avg', operTotal);

  /* 섹션6: 종합 분석표 (6-1.csv) */
  const tbody = document.querySelector('#summaryTable tbody');
  if(tbody){
    const tableRows = summary.map(r=>{
      const zone = r['구역'];
      const total = num(r['월 가동시간']) ?? num(r['월가동시간']) ?? (operByZone[zone]?.total) ?? 0;
      const avgTemp = num(r['평균온도']) ?? 0;
      const { judge, action } = autoJudge(total, avgTemp);
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
