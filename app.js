/* ============================================================
   원주시설관리공단 월간 모니터링 리포트 — 차트 렌더링
   데이터는 data/ 폴더의 CSV 3장에서 읽어옵니다.
     - data/temp.csv        : 일자별 구역 온도
     - data/sensor_temp.csv : 온습도계 설치 구역 온도
     - data/oper.csv        : 일자별 "시설·구역" 가동시간
     - data/summary.csv     : 구역별 종합 분석 (KPI/테이블/누적막대)
     - data/top5.csv        : 월간 누적 가동시간 TOP5
   CSV만 수정하고 새로고침하면 리포트가 갱신됩니다.
   ============================================================ */

let DAYS = Array.from({length:31},(_,i)=>`${i+1}`);
const BLUE = ['#2D6BFF','#E5484D','#22C55E','#F59E0B','#7C3AED','#0F766E','#BE185D','#78716C'];
const GRID = '#E5E9F0';
let HOLIDAYS = new Set();

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

function isHolidayDate(v){
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return false;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6 || s === '2026-05-05' || s === '2026-05-25';
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
        const auxText = `제어기수: ${row.chartControllers ?? row.controllers} | 일평균: ${row.daily}h`;
        ctx.fillStyle = '#5B6577';
        ctx.font = '600 10.5px Pretendard, sans-serif';
        ctx.textAlign = 'left';
        const auxWidth = ctx.measureText(auxText).width;
        const auxStart = chartArea.left + (chartArea.right - chartArea.left) * 0.72;
        const labelX = Math.min(
          Math.max(auxStart, x.getPixelForValue(row.total) + 16),
          chartArea.right - auxWidth - 6
        );
        ctx.fillText(auxText, labelX, y);
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
      layout:{padding:{right:20}},
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

  let tempText, sensorText, operText, sumText, pieText, top5Text;
  try {
    const [t,st,o,s,p,t5] = await Promise.all([
      fetch('data/temp.csv'),
      fetch('data/sensor_temp.csv'),
      fetch('data/oper.csv'),
      fetch('data/summary.csv'),
      fetch('data/db_pie.csv'),
      fetch('data/top5.csv'),
    ]);
    if(!t.ok || !st.ok || !o.ok || !s.ok || !p.ok || !t5.ok) throw new Error('CSV 파일 응답 오류 (HTTP)');
    [tempText, sensorText, operText, sumText, pieText, top5Text] = await Promise.all([t.text(), st.text(), o.text(), s.text(), p.text(), t5.text()]);
  } catch(e){ showError(e.message); return; }

  let temp, sensorTemp, oper, summary, dbPie, top5Rows;
  try {
    temp       = toSeriesMap(parseCSV(tempText));
    sensorTemp = toSeriesMap(parseCSV(sensorText));
    oper       = toSeriesMap(parseCSV(operText));
    summary    = toObjects(parseCSV(sumText));
    dbPie      = toObjects(parseCSV(pieText));
    top5Rows   = toObjects(parseCSV(top5Text));
    DAYS = temp.labels.length ? temp.labels : DAYS;
  } catch(e){ showError('CSV 파싱 중 오류: ' + e.message); return; }

  /* 3. 구역별 실내온도 */
  mkLine('c-all-temp', temp.names, temp.map, BLUE, 28, '일평균 실내온도');
  mkLine('c-outdoor-vs', sensorTemp.names, sensorTemp.map, BLUE, 28, '온습도계 측정 온도');

  /* 5. 시설별 상세 가동시간 */
  const byFacility = {};
  oper.names.forEach(full=>{
    const [fac, zone] = full.split('·');
    (byFacility[fac] ??= {names:[], map:{}});
    byFacility[fac].names.push(zone);
    byFacility[fac].map[zone] = oper.map[full];
  });
  const drawFacility = (id, fac, colors, max) => {
    const f = byFacility[fac]; if(!f) return;
    mkLine(id, f.names, f.map, colors, max, '일평균 가동시간');
  };
  drawFacility('c-main-oper',  '종합운동장', [BLUE[0],BLUE[1],BLUE[2]], 4);
  drawFacility('c-park-oper',  '치악체육관', [BLUE[0],BLUE[6],BLUE[2],BLUE[3],BLUE[4],BLUE[5]], 7);
  drawFacility('c-gym-oper',   '국민체육센터', [BLUE[0],BLUE[1],BLUE[2]], 3);
  drawFacility('c-park2-oper', '종합체육관', [BLUE[0],BLUE[1],BLUE[2],BLUE[3],BLUE[4]], 16);

  /* DB숙소: 구분별 총 가동시간 비중 (파이차트, db_pie.csv) */
  const elPie = document.getElementById('c-dg-oper');
  if(elPie){
    const pieRows = dbPie.map(r=>({
      name: r['구분'],
      total: num(r['총가동시간']) ?? 0,
      daily: num(r['하루평균'])
    }));
    const pieColors = ['#2D6BFF','#C7D6F5','#F59E0B','#22C55E','#7C3AED'];
    const sumTotal = pieRows.reduce((s,r)=>s+r.total,0) || 1;
    new Chart(elPie,{
      type:'doughnut',
      plugins:[ChartDataLabels],
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
              return `${r.name}\n${pct}%`;
            },
            textAlign:'center',
            display: ctx => (ctx.dataset.data[ctx.dataIndex] / sumTotal) > 0.05
          }
        }
      }
    });
  }

  /* 4 & 6 & TOP5: summary.csv */
  const OPER = summary.map(r=>({
    zone: r['구역'],
    total: num(r['총가동']) ?? 0,
    days: num(r['가동일']) ?? 0,
    avgTemp: num(r['평균온도']) ?? 0,
    controllers: num(r['제어기']) ?? 0,
    chartControllers: num(r['차트제어기']),
    daily: num(r['일평균']) ?? 0,
    under: num(r['26도이하']) ?? 0,
    judge: (r['판정']||'').trim(),
    action: r['조치'] || ''
  }));

  const daysRows = [...OPER].sort((a,b)=>b.days-a.days);
  mkBar('c-oper-days', daysRows.map(r=>r.zone), daysRows.map(r=>r.days), daysRows.map((_,i)=>BLUE[i%BLUE.length]), '일');
  mkOperTotal('c-oper-avg', OPER);

  const tbody = document.querySelector('#summaryTable tbody');
  if(tbody){
    const ordered = [...OPER].sort((a,b)=>b.total-a.total);
    tbody.innerHTML = ordered.map((r,i)=>{
      const cls = r.judge==='risk'?'risk':r.judge==='warn'?'warn-txt':'ok-txt';
      const label = r.judge==='risk'?'우선 점검':r.judge==='warn'?'보정 필요':'유지';
      return `<tr><td class="num sum-rank">${i+1}</td><td class="sum-zone">${r.zone}</td><td class="num sum-hours">${r.total.toFixed(2)}h</td><td class="num sum-temp">${r.avgTemp.toFixed(2)}℃</td><td class="sum-judge ${cls}">${label}</td><td class="sum-action">${r.action}</td></tr>`;
    }).join('');
  }

  const TOP_TOTAL = top5Rows.map(r=>({
    p: r['구역'],
    t: num(r['월누적가동시간_시간']) ?? num(r['총가동']) ?? 0,
    e: num(r['제어기수']) ?? num(r['제어기']) ?? 0,
    a: num(r['하루평균가동시간_시간']) ?? num(r['하루평균']) ?? 0
  })).filter(r=>r.p).sort((a,b)=>b.t-a.t).slice(0,5);
  mkTop5('c-t5in','t5inB',TOP_TOTAL,'#2D6BFF','total');
}

window.addEventListener('DOMContentLoaded', main);
