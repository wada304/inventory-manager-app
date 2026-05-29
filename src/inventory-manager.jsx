import React, { useState, useEffect, useCallback, useRef } from "react";
import Papa from 'papaparse';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const CHANNELS = ["Amazon", "楽天市場"];
const MONTHS_JP = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const STORAGE_KEY = "linowa_inventory_v3";
const FBA_UPDATED_KEY = "linowa_fba_updated_v1";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GRID_COLS = "112px 1fr 130px 88px 110px 170px 105px 105px 76px";
const COLOR_AMZ = "#e8622a";
const COLOR_RAK = "#2a7ae8";

// ── 空の annualSales ─────────────────────────────────
function emptyAnnual() {
  return { Amazon: Array(12).fill(0), 楽天市場: Array(12).fill(0) };
}

const DEFAULT_PRODUCTS = [
  {
    id: 1, name: "HYPE GUARD フィギュアケース①", sku: "HG-001", asin: "", jan: "",
    monthlySales: { Amazon: [180,180,180], 楽天市場: [60,60,60] },
    annualSales: emptyAnnual(),
    stock: { FBA: 320, 国内倉庫: 800, 楽天ロジ: 0 },
    orderingMfg: 0, orderingShip: 0,
    orderQty: 2000, mfgLeadDays: 45, shippingDays: 30,
    reorderPoint: 800, bufferDays: 14, stockUpdatedAt: null,
    unitCost: 2800, unitPrice: 8980, color: COLOR_AMZ,
  },
  {
    id: 2, name: "HYPE GUARD スニーカーケース③", sku: "HG-003", asin: "", jan: "",
    monthlySales: { Amazon: [90,90,90], 楽天市場: [30,30,30] },
    annualSales: emptyAnnual(),
    stock: { FBA: 150, 国内倉庫: 200, 楽天ロジ: 0 },
    orderingMfg: 0, orderingShip: 0,
    orderQty: 2000, mfgLeadDays: 45, shippingDays: 30,
    reorderPoint: 800, bufferDays: 14, stockUpdatedAt: null,
    unitCost: 3200, unitPrice: 10980, color: COLOR_RAK,
  },
  {
    id: 3, name: "GLENOA 水耕栽培LEDライト", sku: "HGS02-2CD", asin: "", jan: "",
    monthlySales: { Amazon: [0,0,0], 楽天市場: [0,0,0] },
    annualSales: emptyAnnual(),
    stock: { FBA: 0, 国内倉庫: 300, 楽天ロジ: 0 },
    orderingMfg: 0, orderingShip: 0,
    orderQty: 500, mfgLeadDays: 60, shippingDays: 35,
    reorderPoint: 150, bufferDays: 14, stockUpdatedAt: null,
    unitCost: 6800, unitPrice: 24800, color: "#2ae87a",
  },
];

// ── 計算ユーティリティ ────────────────────────────────
function avgSales(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function totalAvgSales(product) {
  return avgSales(product.monthlySales.Amazon) + avgSales(product.monthlySales.楽天市場);
}
function getStock(s) { return (s.FBA||0) + (s.国内倉庫||0) + (s.楽天ロジ||0); }
function calcLeadDays(p) { return p.mfgLeadDays + p.shippingDays; }
function calcDeadlineDays(p) {
  const avg = totalAvgSales(p);
  if (avg === 0) return null;
  const effectiveStock = getStock(p.stock) + (p.orderingMfg || 0) + (p.orderingShip || 0);
  return Math.round((effectiveStock / avg) * 30 - calcLeadDays(p));
}
function calcAlertLevel(p) {
  const avg = totalAvgSales(p);
  if (avg === 0) return "none";
  const days = calcDeadlineDays(p);
  if (days === null) return "none";
  if (days <= 0) return "critical";
  if (days <= 7) return "warning";
  if (days <= 14) return "caution";
  return "ok";
}
function calcRecommendedOrder(p) {
  const avg = totalAvgSales(p);
  if (avg === 0) return 0;
  const raw = (avg * 2) - getStock(p.stock) - (p.orderingMfg || 0) - (p.orderingShip || 0);
  if (raw <= 0) return 0;
  return Math.ceil(raw / 100) * 100;
}
function addDays(base, days) {
  const d = new Date(base); d.setDate(d.getDate() + days); return d;
}
function fmtDate(date) { return `${date.getMonth()+1}月${date.getDate()}日`; }
function fmtDateTime(date) {
  return `${date.getMonth()+1}月${date.getDate()}日 ${String(date.getHours()).padStart(2,'0')}時${String(date.getMinutes()).padStart(2,'0')}分`;
}
function getStockUpdateInfo(stockUpdatedAt, now) {
  if (!stockUpdatedAt) return null;
  const updated = new Date(stockUpdatedAt);
  const diff = Math.floor((now - updated) / 86400000);
  return { label: fmtDate(updated), needsUpdate: diff >= 7 };
}

// 直近3ヶ月の販売実績から monthlySales を自動計算
function syncMonthlySales(annualSales, now) {
  const m = now.getMonth(); // 0-based
  const idx = [(m-3+12)%12, (m-2+12)%12, (m-1+12)%12];
  return {
    Amazon:   idx.map(i => annualSales?.Amazon?.[i]   || 0),
    楽天市場: idx.map(i => annualSales?.楽天市場?.[i] || 0),
  };
}

const ALERT_CONFIG = {
  critical: { label:"今すぐ発注", bg:"#dc2626", icon:"🚨" },
  warning:  { label:"要発注",     bg:"#ea580c", icon:"⚠️" },
  caution:  { label:"注意",       bg:"#ca8a04", icon:"⚡" },
  ok:       { label:"正常",       bg:"#16a34a", icon:"✅" },
  none:     { label:"販売なし",   bg:"#9ca3af", icon:"—"  },
};

// ── 共通 UI パーツ ────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ borderTop:"1px solid #e5e7eb", paddingTop:"16px", color:"#6b7280",
      fontSize:"11px", letterSpacing:"1px", textTransform:"uppercase", fontWeight:"600" }}>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
      <span style={{ color:"#6b7280", fontSize:"11px", fontWeight:"500" }}>{label}</span>
      {React.cloneElement(children, {
        style: {
          background:"#f9fafb", border:"1px solid #d1d5db", borderRadius:"6px",
          padding:"8px 12px", color:"#111827", fontFamily:FONT, fontSize:"14px",
          width:"100%", outline:"none", boxSizing:"border-box", ...children.props.style,
        },
      })}
    </label>
  );
}
function SalesGrid({ monthlySales, onChange }) {
  const IS = {
    background:"#f9fafb", border:"1px solid #d1d5db", borderRadius:"6px",
    padding:"7px 8px", color:"#111827", fontFamily:FONT, fontSize:"13px",
    width:"100%", outline:"none", boxSizing:"border-box", textAlign:"right",
  };
  const set = (ch, i, v) => {
    const arr = [...monthlySales[ch]]; arr[i] = Number(v);
    onChange({ ...monthlySales, [ch]: arr });
  };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 1fr 1fr 52px", gap:"6px", marginBottom:"6px" }}>
        <div />
        {["月1","月2","月3"].map(m => <div key={m} style={{ textAlign:"center", fontSize:"11px", color:"#9ca3af" }}>{m}</div>)}
        <div style={{ textAlign:"center", fontSize:"11px", color:"#9ca3af" }}>平均</div>
      </div>
      {CHANNELS.map(ch => {
        const avg = Math.round(avgSales(monthlySales[ch]));
        return (
          <div key={ch} style={{ display:"grid", gridTemplateColumns:"90px 1fr 1fr 1fr 52px", gap:"6px", alignItems:"center", marginBottom:"8px" }}>
            <div style={{ fontSize:"13px", color:"#374151", fontWeight:"500" }}>{ch}</div>
            {[0,1,2].map(i => (
              <input key={i} type="number" min="0" value={monthlySales[ch][i]}
                onChange={e => set(ch,i,e.target.value)} style={IS} />
            ))}
            <div style={{ textAlign:"center", fontSize:"13px", fontWeight:"700", color:COLOR_AMZ }}>{avg}</div>
          </div>
        );
      })}
      <div style={{ fontSize:"11px", color:"#9ca3af", marginTop:"2px" }}>※ 平均値をアラート判定に使用します</div>
    </div>
  );
}

// ── 製品編集モーダル ─────────────────────────────────
function ProductModal({ product, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    asin:"", jan:"", bufferDays:14, stockUpdatedAt:null, orderingMfg:0, orderingShip:0,
    annualSales: emptyAnnual(),
    ...product,
    monthlySales: {
      Amazon: Array.isArray(product.monthlySales?.Amazon) ? product.monthlySales.Amazon : [0,0,0],
      楽天市場: Array.isArray(product.monthlySales?.楽天市場) ? product.monthlySales.楽天市場 : [0,0,0],
    },
    stock: { FBA:0, 国内倉庫:0, 楽天ロジ:0, ...product.stock },
  }));
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));
  const setN = (p,k,v) => setForm(f => ({ ...f, [p]:{ ...f[p], [k]:v } }));

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}
      onClick={onClose}>
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:"16px", padding:"32px",
        width:"100%", maxWidth:"600px", maxHeight:"90vh", overflowY:"auto", fontFamily:FONT,
        boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"24px" }}>
          <h2 style={{ color:"#111827", fontSize:"18px", margin:0, fontWeight:"700" }}>
            {product.id ? "製品編集" : "新規製品"}
          </h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:"20px" }}>✕</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
          <Field label="製品名"><input value={form.name} onChange={e => set("name",e.target.value)} /></Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
            <Field label="SKU"><input value={form.sku} onChange={e => set("sku",e.target.value)} /></Field>
            <Field label="ASIN"><input value={form.asin} onChange={e => set("asin",e.target.value)} placeholder="B0XXXXXXXXX" /></Field>
            <Field label="JANコード"><input value={form.jan} onChange={e => set("jan",e.target.value)} /></Field>
          </div>
          <SectionLabel>月間販売数（在庫管理用・直近3ヶ月）</SectionLabel>
          <div style={{ fontSize:"11px", color:"#9ca3af", marginTop:"-8px" }}>
            ※「販売実績」タブで年間データを入力すると直近3ヶ月が自動反映されます
          </div>
          <SalesGrid monthlySales={form.monthlySales} onChange={v => set("monthlySales",v)} />
          <SectionLabel>在庫数</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:"12px" }}>
            <Field label="Amazon FBA"><input type="number" value={form.stock.FBA} onChange={e => setN("stock","FBA",Number(e.target.value))} /></Field>
            <Field label="国内倉庫"><input type="number" value={form.stock.国内倉庫} onChange={e => setN("stock","国内倉庫",Number(e.target.value))} /></Field>
            <Field label="楽天ロジ"><input type="number" value={form.stock.楽天ロジ} onChange={e => setN("stock","楽天ロジ",Number(e.target.value))} /></Field>
            <Field label="在庫更新日"><input type="date" value={form.stockUpdatedAt||""} onChange={e => set("stockUpdatedAt",e.target.value||null)} style={{ textAlign:"left" }} /></Field>
          </div>
          <SectionLabel>発注中</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
            <Field label="製造中（個）"><input type="number" min="0" value={form.orderingMfg} onChange={e => set("orderingMfg",Number(e.target.value))} /></Field>
            <Field label="輸送中（個）"><input type="number" min="0" value={form.orderingShip} onChange={e => set("orderingShip",Number(e.target.value))} /></Field>
          </div>
          <SectionLabel>発注設定</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
            <Field label="発注ロット数"><input type="number" value={form.orderQty} onChange={e => set("orderQty",Number(e.target.value))} /></Field>
            <Field label="製造リードタイム(日)"><input type="number" value={form.mfgLeadDays} onChange={e => set("mfgLeadDays",Number(e.target.value))} /></Field>
            <Field label="輸送日数(日)"><input type="number" value={form.shippingDays} onChange={e => set("shippingDays",Number(e.target.value))} /></Field>
          </div>
          <SectionLabel>価格</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
            <Field label="仕入原価(円)"><input type="number" value={form.unitCost} onChange={e => set("unitCost",Number(e.target.value))} /></Field>
            <Field label="販売価格(円)"><input type="number" value={form.unitPrice} onChange={e => set("unitPrice",Number(e.target.value))} /></Field>
          </div>
        </div>
        <div style={{ marginTop:"24px", display:"flex", gap:"12px", justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 24px", background:"transparent", border:"1px solid #d1d5db",
            borderRadius:"8px", color:"#374151", cursor:"pointer", fontFamily:FONT, fontSize:"14px" }}>キャンセル</button>
          <button onClick={() => onSave(form)} style={{ padding:"10px 24px", background:form.color||COLOR_AMZ,
            border:"none", borderRadius:"8px", color:"#fff", cursor:"pointer", fontFamily:FONT, fontSize:"14px", fontWeight:"600" }}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ── 販売実績ビュー ────────────────────────────────────
function SalesView({ products, onUpdateAnnualSales, now }) {
  const [selectedId, setSelectedId] = useState("all");
  const [chartType, setChartType] = useState("bar");

  const currentMonth = now.getMonth(); // 0-based
  const lastThreeIdx = [(currentMonth-3+12)%12, (currentMonth-2+12)%12, (currentMonth-1+12)%12];

  const targetProducts = selectedId === "all" ? products : products.filter(p => String(p.id) === selectedId);
  const currentProduct = selectedId !== "all" ? products.find(p => String(p.id) === selectedId) : null;

  const chartData = MONTHS_JP.map((month, i) => ({
    month,
    Amazon:   targetProducts.reduce((s,p) => s + (p.annualSales?.Amazon?.[i]   || 0), 0),
    楽天市場: targetProducts.reduce((s,p) => s + (p.annualSales?.楽天市場?.[i] || 0), 0),
  }));

  const Chart = chartType === "bar" ? BarChart : LineChart;
  const AmazonEl = chartType === "bar"
    ? <Bar dataKey="Amazon" fill={COLOR_AMZ} name="Amazon" />
    : <Line type="monotone" dataKey="Amazon" stroke={COLOR_AMZ} strokeWidth={2} dot={{ r:3 }} name="Amazon" />;
  const RakutenEl = chartType === "bar"
    ? <Bar dataKey="楽天市場" fill={COLOR_RAK} name="楽天市場" />
    : <Line type="monotone" dataKey="楽天市場" stroke={COLOR_RAK} strokeWidth={2} dot={{ r:3 }} name="楽天市場" />;

  return (
    <div style={{ padding:"24px 28px", display:"flex", flexDirection:"column", gap:"20px" }}>

      {/* グラフカード */}
      <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e7eb",
        padding:"24px", boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px", flexWrap:"wrap", gap:"12px" }}>
          <div>
            <div style={{ fontSize:"16px", fontWeight:"700", color:"#111827" }}>年間販売数グラフ</div>
            <div style={{ fontSize:"12px", color:"#9ca3af", marginTop:"2px" }}>
              {selectedId === "all" ? `全${products.length}製品の合計` : currentProduct?.name}
            </div>
          </div>
          <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
            {/* 製品選択 */}
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              style={{ background:"#f9fafb", border:"1px solid #d1d5db", borderRadius:"8px",
                padding:"8px 12px", color:"#111827", fontFamily:FONT, fontSize:"13px",
                outline:"none", cursor:"pointer" }}>
              <option value="all">全製品（合計）</option>
              {products.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
            {/* グラフ種別 */}
            <div style={{ display:"flex", border:"1px solid #d1d5db", borderRadius:"8px", overflow:"hidden" }}>
              {[["bar","棒"],["line","折れ線"]].map(([type,label]) => (
                <button key={type} onClick={() => setChartType(type)} style={{
                  padding:"7px 14px", background: chartType===type ? "#111827" : "#fff",
                  border:"none", color: chartType===type ? "#fff" : "#6b7280",
                  cursor:"pointer", fontFamily:FONT, fontSize:"12px", fontWeight:"600",
                }}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <Chart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize:12, fill:"#6b7280" }} />
            <YAxis tick={{ fontSize:12, fill:"#6b7280" }} />
            <Tooltip
              contentStyle={{ fontFamily:FONT, fontSize:"13px", borderRadius:"8px", border:"1px solid #e5e7eb" }}
              formatter={(v,n) => [`${v.toLocaleString()}個`, n]}
            />
            <Legend wrapperStyle={{ fontSize:"12px", fontFamily:FONT }} />
            {AmazonEl}
            {RakutenEl}
          </Chart>
        </ResponsiveContainer>
      </div>

      {/* 月別入力テーブル（製品選択時のみ） */}
      {currentProduct ? (
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e7eb",
          padding:"24px", boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ marginBottom:"20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>
              <span style={{ width:"10px", height:"10px", borderRadius:"50%",
                background:currentProduct.color, display:"inline-block", flexShrink:0 }} />
              <span style={{ fontSize:"16px", fontWeight:"700", color:"#111827" }}>
                月別販売数入力：{currentProduct.name}
              </span>
            </div>
            <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"6px", display:"flex", gap:"8px", alignItems:"center" }}>
              <span style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:"4px",
                padding:"2px 8px", color:"#92400e", fontSize:"11px", fontWeight:"600" }}>
                自動反映中
              </span>
              <span>
                直近3ヶ月（{lastThreeIdx.map(i => MONTHS_JP[i]).join("・")}）の平均を在庫管理に自動反映します
              </span>
            </div>
          </div>

          {/* テーブルヘッダー */}
          <div style={{ display:"grid", gridTemplateColumns:"60px 1fr 1fr", gap:"8px", marginBottom:"8px",
            fontSize:"11px", color:"#6b7280", fontWeight:"600", textTransform:"uppercase",
            letterSpacing:"0.5px", paddingBottom:"8px", borderBottom:"1px solid #f3f4f6" }}>
            <div>月</div>
            <div style={{ textAlign:"right" }}>Amazon</div>
            <div style={{ textAlign:"right" }}>楽天市場</div>
          </div>

          {/* 入力行 */}
          {MONTHS_JP.map((month, i) => {
            const isActive = lastThreeIdx.includes(i);
            return (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"60px 1fr 1fr", gap:"8px",
                alignItems:"center", marginBottom:"4px",
                background: isActive ? "#fff7ed" : "transparent",
                borderRadius:"6px", padding: isActive ? "4px 8px" : "4px 8px",
                border: isActive ? "1px solid #fed7aa" : "1px solid transparent",
              }}>
                <div style={{ fontSize:"13px", fontWeight: isActive ? "700" : "400",
                  color: isActive ? "#c2410c" : "#374151", display:"flex", alignItems:"center", gap:"4px" }}>
                  {month}
                  {isActive && <span style={{ fontSize:"9px", color:"#ea580c" }}>●</span>}
                </div>
                {CHANNELS.map(ch => (
                  <input key={ch} type="number" min="0"
                    value={currentProduct.annualSales?.[ch]?.[i] ?? 0}
                    onChange={e => onUpdateAnnualSales(currentProduct.id, ch, i, Number(e.target.value))}
                    style={{ background: isActive ? "#fff" : "#f9fafb",
                      border: `1px solid ${isActive ? "#fbbf24" : "#d1d5db"}`,
                      borderRadius:"6px", padding:"7px 10px", color:"#111827",
                      fontFamily:FONT, fontSize:"13px", width:"100%", outline:"none",
                      boxSizing:"border-box", textAlign:"right",
                      fontWeight: isActive ? "600" : "400",
                    }}
                  />
                ))}
              </div>
            );
          })}

          {/* 合計行 */}
          <div style={{ display:"grid", gridTemplateColumns:"60px 1fr 1fr", gap:"8px",
            marginTop:"12px", paddingTop:"12px", borderTop:"1px solid #e5e7eb" }}>
            <div style={{ fontSize:"12px", color:"#6b7280", fontWeight:"600" }}>年計</div>
            {CHANNELS.map(ch => {
              const total = (currentProduct.annualSales?.[ch] || []).reduce((s,v) => s+v, 0);
              return (
                <div key={ch} style={{ textAlign:"right", fontSize:"14px", fontWeight:"700",
                  color: ch==="Amazon" ? COLOR_AMZ : COLOR_RAK }}>
                  {total.toLocaleString()}<span style={{ fontSize:"11px", fontWeight:"400", color:"#9ca3af", marginLeft:"2px" }}>個</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px dashed #d1d5db",
          padding:"32px", textAlign:"center", color:"#9ca3af", fontSize:"14px" }}>
          上のセレクトボックスで製品を選択すると月別の販売数を入力できます
        </div>
      )}
    </div>
  );
}

// ── 在庫管理ビュー ────────────────────────────────────
function InventoryView({ products, now, onEdit, onDelete, filter, setFilter }) {
  const alerts = products.filter(p => { const l=calcAlertLevel(p); return l==="critical"||l==="warning"; });
  const filtered = filter==="all" ? products : products.filter(p => calcAlertLevel(p)===filter);
  const orderNeeded = products.filter(p => calcRecommendedOrder(p) > 0)
    .sort((a, b) => calcRecommendedOrder(b) - calcRecommendedOrder(a));
  const totalStockValue = products.reduce((s,p) => s + getStock(p.stock)*p.unitCost, 0);
  const totalMonthlyAvg = products.reduce((s,p) => s + Math.round(totalAvgSales(p)), 0);

  return (
    <>
      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div style={{ background:"#fff1f2", borderBottom:"1px solid #fecaca", padding:"12px 28px",
          display:"flex", gap:"8px", alignItems:"center", overflowX:"auto" }}>
          <span>🚨</span>
          <span style={{ color:"#dc2626", fontSize:"12px", fontWeight:"700", whiteSpace:"nowrap" }}>発注アラート:</span>
          {alerts.map(p => (
            <span key={p.id} style={{ background:"#fee2e2", border:"1px solid #fca5a5",
              borderRadius:"4px", padding:"3px 10px", color:"#dc2626", fontSize:"12px", whiteSpace:"nowrap" }}>
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1px",
        background:"#e5e7eb", borderBottom:"1px solid #e5e7eb" }}>
        {[
          { label:"管理製品数",        value:products.length,                             unit:"SKU", color:COLOR_AMZ },
          { label:"アラート発生",      value:alerts.length,                               unit:"件",  color:alerts.length>0?"#dc2626":"#16a34a" },
          { label:"在庫総額",          value:`¥${(totalStockValue/10000).toFixed(1)}万`, unit:"",    color:"#2563eb" },
          { label:"月平均販売(3ヶ月)", value:totalMonthlyAvg.toLocaleString(),            unit:"個",  color:"#7c3aed" },
        ].map(card => (
          <div key={card.label} style={{ background:"#fff", padding:"20px 24px" }}>
            <div style={{ color:"#9ca3af", fontSize:"11px", fontWeight:"500",
              textTransform:"uppercase", marginBottom:"8px" }}>{card.label}</div>
            <div style={{ color:card.color, fontSize:"28px", fontWeight:"700" }}>
              {card.value}
              <span style={{ fontSize:"14px", fontWeight:"400", marginLeft:"4px" }}>{card.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 発注サマリー */}
      {orderNeeded.length > 0 && (
        <div style={{ background:"#fff7ed", borderBottom:"1px solid #fed7aa", padding:"16px 28px" }}>
          <div style={{ fontSize:"13px", fontWeight:"700", color:"#c2410c", marginBottom:"12px" }}>
            📦 発注サマリー — 発注推奨 {orderNeeded.length}件
          </div>
          <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
            {orderNeeded.map(p => {
              const rec = calcRecommendedOrder(p);
              const lv = calcAlertLevel(p);
              const color = lv==="critical" ? "#dc2626" : lv==="warning" ? "#ea580c" : "#374151";
              const borderColor = lv==="critical" ? "#fca5a5" : lv==="warning" ? "#fdba74" : "#d1d5db";
              return (
                <div key={p.id} style={{ background:"#fff", border:`1px solid ${borderColor}`,
                  borderLeft:`3px solid ${color}`, borderRadius:"8px", padding:"10px 14px",
                  minWidth:"160px", maxWidth:"220px" }}>
                  <div style={{ fontSize:"11px", color:"#6b7280", fontWeight:"500",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</div>
                  <div style={{ fontSize:"22px", fontWeight:"700", color, marginTop:"4px", lineHeight:"1.2" }}>
                    {rec.toLocaleString()}
                    <span style={{ fontSize:"12px", fontWeight:"400", color:"#9ca3af", marginLeft:"3px" }}>個</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"3px" }}>
                    月販 {Math.round(totalAvgSales(p))}個 × 2ヶ月基準
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ padding:"0 28px", display:"flex", gap:"4px",
        borderBottom:"1px solid #e5e7eb", background:"#fff" }}>
        {[
          {key:"all",label:"すべて"},{key:"critical",label:"🚨 今すぐ発注"},
          {key:"warning",label:"⚠️ 要発注"},{key:"caution",label:"⚡ 注意"},{key:"ok",label:"✓ 正常"},
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            padding:"14px 16px 12px", background:"none", border:"none",
            borderBottom: filter===tab.key ? "2px solid #e8622a" : "2px solid transparent",
            color: filter===tab.key ? "#111827" : "#9ca3af",
            cursor:"pointer", fontFamily:FONT, fontSize:"13px",
            fontWeight: filter===tab.key ? "600" : "400", transition:"all 0.15s",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Product Table */}
      <div style={{ padding:"16px 28px" }}>
        <div style={{ display:"grid", gridTemplateColumns:GRID_COLS,
          background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:"10px 10px 0 0",
          padding:"10px 16px", fontSize:"11px", color:"#6b7280", fontWeight:"600",
          letterSpacing:"0.5px", textTransform:"uppercase" }}>
          <div>ステータス</div><div>製品名</div>
          <div style={{ textAlign:"right" }}>在庫数</div>
          <div style={{ textAlign:"right" }}>月販数</div>
          <div style={{ textAlign:"center" }}>推奨発注数</div>
          <div style={{ textAlign:"center" }}>発注中</div>
          <div style={{ textAlign:"center" }}>発注期限</div>
          <div style={{ textAlign:"center" }}>在庫切れ予定</div>
          <div />
        </div>

        <div style={{ border:"1px solid #e5e7eb", borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden" }}>
          {filtered.map((p, idx) => {
            const level = calcAlertLevel(p), alert = ALERT_CONFIG[level];
            const totalStock = getStock(p.stock);
            const avgAmz = Math.round(avgSales(p.monthlySales.Amazon));
            const avgRak = Math.round(avgSales(p.monthlySales.楽天市場));
            const avgTotal = avgAmz + avgRak;
            const deadlineDays = calcDeadlineDays(p);
            const recOrder = calcRecommendedOrder(p);
            const updateInfo = getStockUpdateInfo(p.stockUpdatedAt, now);
            const hasOrdering = (p.orderingMfg||0)+(p.orderingShip||0) > 0;
            const deadlineColor = deadlineDays===null?"#9ca3af":deadlineDays<=0?"#dc2626":deadlineDays<=7?"#ea580c":deadlineDays<=14?"#ca8a04":"#374151";
            const effectiveStock = totalStock + (p.orderingMfg || 0) + (p.orderingShip || 0);
            const stockoutDays = avgTotal===0 ? null : Math.round((effectiveStock / avgTotal) * 30);
            const stockoutDate = stockoutDays===null ? null : addDays(now, stockoutDays);
            const bg = idx%2===0?"#fff":"#fafafa";

            return (
              <div key={p.id} style={{ display:"grid", gridTemplateColumns:GRID_COLS,
                padding:"14px 16px", alignItems:"center",
                background:bg, borderTop:idx===0?"none":"1px solid #f3f4f6",
                borderLeft:`3px solid ${alert.bg}`, transition:"background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background="#f0f9ff"}
                onMouseLeave={e => e.currentTarget.style.background=bg}>

                {/* ステータス */}
                <div><span style={{ display:"inline-flex", alignItems:"center", gap:"4px",
                  padding:"3px 8px", borderRadius:"4px",
                  background:alert.bg+"18", border:`1px solid ${alert.bg}44`,
                  color:alert.bg, fontSize:"11px", fontWeight:"700", whiteSpace:"nowrap" }}>
                  {alert.icon} {alert.label}
                </span></div>

                {/* 製品名 */}
                <div style={{ minWidth:0, paddingRight:"12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"6px", flexWrap:"wrap" }}>
                    <span style={{ width:"7px", height:"7px", borderRadius:"50%",
                      background:p.color, flexShrink:0, display:"inline-block" }} />
                    <span style={{ fontSize:"13px", fontWeight:"600", color:"#111827",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                    {updateInfo?.needsUpdate && (
                      <span style={{ background:"#fef3c7", border:"1px solid #fcd34d",
                        borderRadius:"3px", padding:"1px 5px", color:"#92400e",
                        fontSize:"10px", fontWeight:"700", flexShrink:0 }}>要更新</span>
                    )}
                  </div>
                  <div style={{ fontSize:"11px", color:"#9ca3af", marginTop:"2px", paddingLeft:"13px" }}>
                    {p.sku && <span>{p.sku}</span>}
                    {p.asin && <span style={{ marginLeft:"8px" }}>ASIN:{p.asin}</span>}
                  </div>
                </div>

                {/* 在庫数 */}
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"16px", fontWeight:"700", color:"#111827" }}>
                    {totalStock.toLocaleString()}<span style={{ fontSize:"11px", fontWeight:"400", color:"#9ca3af", marginLeft:"2px" }}>個</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"2px" }}>
                    FBA {p.stock.FBA} / 倉 {p.stock.国内倉庫} / 楽 {p.stock.楽天ロジ||0}
                  </div>
                </div>

                {/* 月販数 */}
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"16px", fontWeight:"700", color:"#374151" }}>
                    {avgTotal}<span style={{ fontSize:"11px", fontWeight:"400", color:"#9ca3af", marginLeft:"2px" }}>個</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"2px" }}>AMZ {avgAmz} / 楽 {avgRak}</div>
                </div>

                {/* 推奨発注数 */}
                <div style={{ textAlign:"center" }}>
                  {recOrder > 0 ? (
                    <div>
                      <div style={{ fontSize:"16px", fontWeight:"700",
                        color: level==="critical" ? "#dc2626" : level==="warning" ? "#ea580c" : "#374151" }}>
                        {recOrder.toLocaleString()}
                        <span style={{ fontSize:"11px", fontWeight:"400", color:"#9ca3af", marginLeft:"2px" }}>個</span>
                      </div>
                      <div style={{ fontSize:"10px", marginTop:"2px",
                        color: level==="critical" ? "#dc2626" : level==="warning" ? "#ea580c" : "#9ca3af",
                        fontWeight:"600" }}>
                        {level==="critical" ? "🚨 要発注" : level==="warning" ? "⚠️ 要発注" : "発注推奨"}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize:"12px", color:"#9ca3af" }}>発注不要</span>
                  )}
                </div>

                {/* 発注中 */}
                <div style={{ textAlign:"center" }}>
                  {hasOrdering ? (
                    <div style={{ fontSize:"11px", color:"#374151", lineHeight:"1.6" }}>
                      <div>製造中 <strong style={{ color:"#2563eb" }}>{(p.orderingMfg||0).toLocaleString()}</strong>個</div>
                      <div>輸送中 <strong style={{ color:"#7c3aed" }}>{(p.orderingShip||0).toLocaleString()}</strong>個</div>
                    </div>
                  ) : <span style={{ fontSize:"12px", color:"#d1d5db" }}>—</span>}
                </div>

                {/* 発注期限 */}
                <div style={{ textAlign:"center" }}>
                  {deadlineDays === null ? (
                    <span style={{ fontSize:"12px", color:"#9ca3af" }}>—</span>
                  ) : (
                    <div>
                      <div style={{ fontSize:"13px", fontWeight:"700", color:deadlineColor }}>
                        {deadlineDays <= 0 ? "超過" : fmtDate(addDays(now, deadlineDays))}
                      </div>
                      <div style={{ fontSize:"10px", color:deadlineColor, marginTop:"2px" }}>
                        {deadlineDays <= 0 ? `${Math.abs(deadlineDays)}日超過` : `残り${deadlineDays}日`}
                      </div>
                    </div>
                  )}
                </div>

                {/* 在庫切れ予定 */}
                <div style={{ textAlign:"center" }}>
                  {stockoutDate === null ? (
                    <span style={{ fontSize:"12px", color:"#9ca3af" }}>—</span>
                  ) : (
                    <div>
                      <span style={{ fontSize:"13px", fontWeight:"600", color:"#374151" }}>
                        {fmtDate(stockoutDate)}
                      </span>
                      <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"2px" }}>({stockoutDays}日後)</div>
                    </div>
                  )}
                </div>

                {/* 操作 */}
                <div style={{ display:"flex", flexDirection:"column", gap:"4px", alignItems:"flex-end" }}>
                  <button onClick={() => onEdit(p)} style={{ padding:"5px 12px", background:"transparent",
                    border:"1px solid #d1d5db", borderRadius:"5px", color:"#374151",
                    cursor:"pointer", fontFamily:FONT, fontSize:"12px", whiteSpace:"nowrap" }}>編集</button>
                  <button onClick={() => onDelete(p.id)} style={{ padding:"5px 12px", background:"transparent",
                    border:"1px solid #f3f4f6", borderRadius:"5px", color:"#d1d5db",
                    cursor:"pointer", fontFamily:FONT, fontSize:"12px" }}>削除</button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px", color:"#d1d5db", fontSize:"14px", background:"#fff" }}>
              該当する製品はありません
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding:"14px 28px", borderTop:"1px solid #e5e7eb", display:"flex", gap:"20px",
        fontSize:"11px", color:"#9ca3af", flexWrap:"wrap", background:"#fff" }}>
        <span style={{ color:"#6b7280", fontWeight:"600" }}>アラート基準（発注期限までの残り日数）</span>
        <span>🚨 今すぐ発注 = 残り0日以下</span>
        <span>⚠️ 要発注 = 残り1〜7日</span>
        <span>⚡ 注意 = 残り8〜14日</span>
        <span>✅ 正常 = 残り15日以上</span>
        <span>* データはブラウザに保存されます</span>
        <span style={{ marginLeft:"auto", color:"#d1d5db" }}>v1.3.0</span>
      </div>
    </>
  );
}

// ── Amazon FBA CSV アップロードモーダル ──────────────────
function FbaUploadModal({ products, onUpdate, onClose }) {
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const processRows = (rows, fields) => {
    const lc = s => (s || '').trim().toLowerCase();
    const cleanStr = s => (s || '').replace(/^["']+|["']+$/g, '').trim().toUpperCase();

    // 列名を優先順で検索（大文字小文字無視）
    const findField = (patterns) => {
      for (const pat of patterns) {
        const f = fields.find(f => lc(f) === pat);
        if (f) return f;
      }
      return fields.find(f => patterns.some(pat => lc(f).includes(pat))) || null;
    };

    const asinField = findField(['asin']);
    const skuField  = findField(['seller-sku', '出品者sku', 'sku']);
    const qtyField  = findField(['在庫あり', 'fbaの在庫数', 'afn-fulfillable-quantity',
                                 'fulfillable-quantity', 'fulfillable quantity', '販売可']);
    const nameField = findField(['商品名', 'product-name', 'title', 'name']);

    if (!asinField && !skuField) {
      setResult({ error: 'ASIN列もSKU列も見つかりません。\n検出済み列: ' + fields.slice(0, 10).join(', ') });
      return;
    }
    if (!qtyField) {
      setResult({ error: '在庫数列が見つかりません。\n検出済み列: ' + fields.slice(0, 10).join(', ') });
      return;
    }

    const updates = [], skipped = [], csvRows = [];
    const updatedProductIds = new Set();

    for (const row of rows) {
      const asin = ((asinField ? row[asinField] : '') || '').trim();
      const sku  = ((skuField  ? row[skuField]  : '') || '').trim();
      const qty  = parseInt((row[qtyField] || '').replace(/,/g, ''), 10);
      const name = ((nameField ? row[nameField] : '') || '').trim();

      if (!asin && !sku) continue;

      csvRows.push({ asin, sku, qty: isNaN(qty) ? '—' : qty, name });

      if (isNaN(qty)) continue;

      const asinKey = cleanStr(asin), skuKey = cleanStr(sku);
      const product =
        (asinKey && products.find(p => cleanStr(p.asin) === asinKey)) ||
        (skuKey  && products.find(p => cleanStr(p.sku)  === skuKey));

      if (product) {
        if (!updatedProductIds.has(product.id)) {
          updatedProductIds.add(product.id);
          updates.push({ id: product.id, name: product.name, asin, sku, oldQty: product.stock.FBA, newQty: qty });
        }
      } else {
        skipped.push({ asin, sku, name, qty });
      }
    }

    if (updates.length > 0) onUpdate(updates, new Date().toISOString());
    setResult({
      updates, skipped, csvRows,
      rawLineCount: rows.length,
      detectedCols: {
        asinCol:    asinField  ? `"${asinField}"`  : '未検出',
        skuCol:     skuField   ? `"${skuField}"`   : '未検出',
        qtyCol:     qtyField   ? `"${qtyField}"`   : '未検出',
        allHeaders: fields.map((f, i) => `[${i}] ${f}`).join(' / '),
      },
    });
  };

  const handleFile = (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: ({ data, meta }) => processRows(data, meta.fields || []),
      error: (err) => setResult({ error: `ファイルの読み込みに失敗しました: ${err.message}` }),
    });
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}
      onClick={onClose}>
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:"16px", padding:"32px",
        width:"100%", maxWidth:"640px", maxHeight:"88vh", overflowY:"auto", fontFamily:FONT,
        boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"24px" }}>
          <div>
            <h2 style={{ color:"#111827", fontSize:"18px", margin:0, fontWeight:"700" }}>Amazon FBA在庫 CSV更新</h2>
            <p style={{ color:"#6b7280", fontSize:"12px", margin:"4px 0 0" }}>
              セラーセントラルからダウンロードしたCSVでFBA在庫を一括更新します
            </p>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#9ca3af",
            cursor:"pointer", fontSize:"20px", flexShrink:0, marginLeft:"16px" }}>✕</button>
        </div>

        {/* ダウンロード手順 */}
        <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:"10px",
          padding:"16px", marginBottom:"20px" }}>
          <div style={{ fontSize:"12px", fontWeight:"700", color:"#1d4ed8", marginBottom:"10px" }}>
            📋 CSVのダウンロード手順（セラーセントラル）
          </div>
          {[
            "セラーセントラルにログイン",
            "上部メニュー「在庫」→「在庫管理」をクリック",
            "右上の「ダウンロード」ボタンをクリック",
            "「すべての在庫」を選択してCSVをダウンロード",
            "ダウンロードしたファイルを下のエリアにアップロード",
          ].map((step, i) => (
            <div key={i} style={{ display:"flex", gap:"10px", alignItems:"flex-start",
              marginBottom: i < 4 ? "6px" : 0 }}>
              <span style={{ background:"#1d4ed8", color:"#fff", borderRadius:"50%",
                width:"18px", height:"18px", minWidth:"18px", display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:"10px", fontWeight:"700", marginTop:"1px" }}>{i+1}</span>
              <span style={{ fontSize:"12px", color:"#1e40af", lineHeight:"1.5" }}>{step}</span>
            </div>
          ))}
          <div style={{ marginTop:"10px", fontSize:"11px", color:"#3b82f6",
            borderTop:"1px solid #bfdbfe", paddingTop:"10px" }}>
            ※ ASINが登録されていない製品は照合されません。先に各製品の編集画面でASINを登録してください。
            文字化けが発生した場合はファイルをUTF-8で保存し直してください。
          </div>
        </div>

        {/* ファイルアップロードエリア */}
        {!result && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            style={{ border:`2px dashed ${dragging ? "#3b82f6" : "#d1d5db"}`,
              borderRadius:"10px", padding:"36px", textAlign:"center", cursor:"pointer",
              background: dragging ? "#eff6ff" : "#f9fafb", transition:"all 0.2s" }}>
            <div style={{ fontSize:"40px", marginBottom:"8px" }}>📂</div>
            <div style={{ fontSize:"14px", color:"#374151", fontWeight:"600", marginBottom:"4px" }}>
              CSVファイルをドラッグ＆ドロップ
            </div>
            <div style={{ fontSize:"12px", color:"#9ca3af", marginBottom:"8px" }}>または クリックしてファイルを選択</div>
            <div style={{ fontSize:"11px", color:"#d1d5db" }}>対応形式：.csv / .txt（タブ区切り・カンマ区切り）</div>
            <input ref={inputRef} type="file" accept=".csv,.txt" style={{ display:"none" }}
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }} />
          </div>
        )}

        {/* 結果表示 */}
        {result && (
          <div>
            {result.error && (
              <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:"8px",
                padding:"12px 16px", color:"#dc2626", fontSize:"13px", marginBottom:"12px",
                whiteSpace:"pre-wrap" }}>
                ⚠️ {result.error}
              </div>
            )}
            {!result.error && (
              <div style={{ background: result.updates?.length > 0 ? "#f0fdf4" : "#f9fafb",
                border: `1px solid ${result.updates?.length > 0 ? "#86efac" : "#e5e7eb"}`,
                borderRadius:"8px", padding:"12px 16px", fontSize:"13px",
                color: result.updates?.length > 0 ? "#15803d" : "#6b7280", marginBottom:"12px",
                fontWeight:"600" }}>
                {result.updates?.length > 0 ? "✅" : "—"}{" "}
                {result.updates?.length}件更新しました。
                {result.skipped?.length > 0 && `${result.skipped.length}件はASIN未登録のためスキップしました。`}
              </div>
            )}
            {result.updates?.length > 0 && (
              <div style={{ marginBottom:"16px" }}>
                <div style={{ fontSize:"12px", fontWeight:"600", color:"#6b7280", marginBottom:"8px" }}>
                  更新内容
                </div>
                <div style={{ border:"1px solid #e5e7eb", borderRadius:"8px", overflow:"hidden" }}>
                  {result.updates.map((u, i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto auto",
                      padding:"8px 12px", background: i%2===0 ? "#fff" : "#f9fafb",
                      borderTop: i===0 ? "none" : "1px solid #f3f4f6",
                      fontSize:"12px", alignItems:"center", gap:"16px" }}>
                      <div>
                        <div style={{ fontWeight:"600", color:"#111827" }}>{u.name}</div>
                        <div style={{ color:"#9ca3af", fontSize:"11px" }}>
                          {u.asin && `ASIN: ${u.asin}`}{u.asin && u.sku && ' / '}{u.sku && `SKU: ${u.sku}`}
                        </div>
                      </div>
                      <div style={{ color:"#9ca3af", fontSize:"11px", whiteSpace:"nowrap" }}>{u.oldQty}個 →</div>
                      <div style={{ fontWeight:"700", color:"#16a34a", fontSize:"15px", whiteSpace:"nowrap" }}>{u.newQty}個</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.skipped?.length > 0 && (
              <div style={{ marginBottom:"16px" }}>
                <div style={{ fontSize:"12px", fontWeight:"600", color:"#9ca3af", marginBottom:"6px" }}>
                  スキップ（{result.skipped.length}件） — ASINもSKUも一致しないため照合不可
                </div>
                <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:"8px",
                  padding:"8px 12px", maxHeight:"120px", overflowY:"auto" }}>
                  {result.skipped.map((s, i) => (
                    <div key={i} style={{ fontSize:"11px", color:"#6b7280", padding:"3px 0",
                      borderTop: i===0 ? "none" : "1px solid #f3f4f6" }}>
                      <span style={{ fontFamily:"monospace", color:"#374151" }}>{s.asin || s.sku}</span>
                      {s.name && <span style={{ color:"#9ca3af", marginLeft:"8px" }}>
                        {s.name.slice(0, 45)}{s.name.length > 45 ? '…' : ''}
                      </span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* デバッグパネル */}
            {result.csvRows && (
              <details style={{ marginBottom:"16px" }}>
                <summary style={{ fontSize:"12px", fontWeight:"600", color:"#6b7280",
                  cursor:"pointer", userSelect:"none", padding:"8px 0" }}>
                  🔍 照合デバッグ情報（クリックで展開）
                  　ファイル行数: {result.rawLineCount}行 / 表示行数: {result.csvRows?.length}行
                </summary>
                <div style={{ marginTop:"8px", display:"flex", flexDirection:"column", gap:"10px" }}>
                  {/* 検出列名 */}
                  {result.detectedCols && (
                    <div style={{ background:"#fefce8", border:"1px solid #fde047", borderRadius:"6px",
                      padding:"10px 12px", fontSize:"11px", fontFamily:"monospace" }}>
                      <div style={{ fontWeight:"700", color:"#713f12", marginBottom:"6px" }}>検出した列</div>
                      <div>ASIN列: <span style={{ color:"#1d4ed8" }}>{result.detectedCols.asinCol}</span></div>
                      <div>SKU列 : <span style={{ color:"#1d4ed8" }}>{result.detectedCols.skuCol}</span></div>
                      <div>在庫列: <span style={{ color:"#1d4ed8" }}>{result.detectedCols.qtyCol}</span></div>
                      <div style={{ marginTop:"6px", color:"#78716c", wordBreak:"break-all" }}>
                        全列: {result.detectedCols.allHeaders}
                      </div>
                    </div>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                    {/* ツール登録製品 — 引用符付きで空白を可視化 */}
                    <div>
                      <div style={{ fontSize:"11px", fontWeight:"700", color:"#374151", marginBottom:"6px" }}>
                        ツール登録製品（{products.length}件）※引用符内が実値
                      </div>
                      <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:"6px",
                        padding:"8px", maxHeight:"200px", overflowY:"auto", fontSize:"11px",
                        fontFamily:"monospace" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px",
                          color:"#9ca3af", fontWeight:"600", marginBottom:"4px",
                          paddingBottom:"4px", borderBottom:"1px solid #e5e7eb" }}>
                          <span>ASIN</span><span>SKU</span>
                        </div>
                        {products.map(p => (
                          <div key={p.id} style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
                            gap:"4px", padding:"2px 0", borderBottom:"1px solid #f3f4f6",
                            color: p.asin || p.sku ? "#111827" : "#d1d5db" }}>
                            <span title={JSON.stringify(p.asin)}>"{p.asin || ''}"</span>
                            <span title={JSON.stringify(p.sku)}>"{p.sku || ''}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* CSV読み取りデータ — 引用符付きで空白を可視化 */}
                    <div>
                      <div style={{ fontSize:"11px", fontWeight:"700", color:"#374151", marginBottom:"6px" }}>
                        CSV読み取り（{result.csvRows.length}行）※引用符内が実値
                      </div>
                      <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:"6px",
                        padding:"8px", maxHeight:"200px", overflowY:"auto", fontSize:"11px",
                        fontFamily:"monospace" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:"4px",
                          color:"#9ca3af", fontWeight:"600", marginBottom:"4px",
                          paddingBottom:"4px", borderBottom:"1px solid #e5e7eb" }}>
                          <span>ASIN</span><span>SKU</span><span>在庫</span>
                        </div>
                        {result.csvRows.map((r, i) => {
                          const matched = result.updates.some(u => u.asin === r.asin && u.sku === r.sku);
                          return (
                            <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto",
                              gap:"4px", padding:"2px 0", borderBottom:"1px solid #f3f4f6",
                              color: matched ? "#15803d" : "#374151",
                              background: matched ? "#f0fdf4" : "transparent" }}>
                              <span title={JSON.stringify(r.asin)}>"{r.asin || ''}"</span>
                              <span title={JSON.stringify(r.sku)}>"{r.sku || ''}"</span>
                              <span style={{ textAlign:"right" }}>{r.qty}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            )}
            <div style={{ display:"flex", gap:"10px" }}>
              <button onClick={() => setResult(null)}
                style={{ flex:1, padding:"10px", background:"#f9fafb",
                  border:"1px solid #d1d5db", borderRadius:"8px", color:"#374151",
                  cursor:"pointer", fontFamily:FONT, fontSize:"13px" }}>
                別のファイルを読み込む
              </button>
              <button onClick={onClose}
                style={{ flex:1, padding:"10px", background:COLOR_AMZ,
                  border:"none", borderRadius:"8px", color:"#fff",
                  cursor:"pointer", fontFamily:FONT, fontSize:"13px", fontWeight:"600" }}>
                完了
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────
export default function InventoryManager() {
  const [products, setProducts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return DEFAULT_PRODUCTS;
      return JSON.parse(saved).map(p => ({
        annualSales: emptyAnnual(), orderingMfg:0, orderingShip:0, bufferDays:14, ...p,
        asin: (p.asin || '').replace(/^["']+|["']+$/g, '').trim(),
        sku:  (p.sku  || '').replace(/^["']+|["']+$/g, '').trim(),
      }));
    } catch { return DEFAULT_PRODUCTS; }
  });
  const [editProduct, setEditProduct] = useState(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("inventory");
  const [now] = useState(new Date());
  const [fbaUpdatedAt, setFbaUpdatedAt] = useState(() => {
    try { return localStorage.getItem(FBA_UPDATED_KEY) || null; } catch { return null; }
  });
  const [showFbaUpload, setShowFbaUpload] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(products)); } catch {}
  }, [products]);

  const saveProduct = useCallback((form) => {
    const clean = {
      ...form,
      asin: (form.asin || '').replace(/^["']+|["']+$/g, '').trim(),
      sku:  (form.sku  || '').replace(/^["']+|["']+$/g, '').trim(),
    };
    setProducts(prev => clean.id ? prev.map(p => p.id===clean.id ? clean : p) : [...prev, { ...clean, id:Date.now() }]);
    setEditProduct(null);
  }, []);

  const deleteProduct = id => {
    if (confirm("この製品を削除しますか？")) setProducts(prev => prev.filter(p => p.id!==id));
  };

  const updateFbaStock = useCallback((updates, timestamp) => {
    setProducts(prev => prev.map(p => {
      const upd = updates.find(u => u.id === p.id);
      if (!upd) return p;
      return { ...p, stock: { ...p.stock, FBA: upd.newQty }, stockUpdatedAt: timestamp.split('T')[0] };
    }));
    setFbaUpdatedAt(timestamp);
    try { localStorage.setItem(FBA_UPDATED_KEY, timestamp); } catch {}
  }, []);

  // 販売実績入力 → annualSales 更新 + monthlySales 自動反映
  const updateAnnualSales = useCallback((productId, channel, monthIdx, value) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const newAnnual = {
        Amazon:   [...(p.annualSales?.Amazon   || Array(12).fill(0))],
        楽天市場: [...(p.annualSales?.楽天市場 || Array(12).fill(0))],
      };
      newAnnual[channel][monthIdx] = Number(value);
      const newMonthly = syncMonthlySales(newAnnual, now);
      return { ...p, annualSales: newAnnual, monthlySales: newMonthly };
    }));
  }, [now]);

  const newProduct = {
    id:null, name:"", sku:"", asin:"", jan:"",
    monthlySales:{ Amazon:[0,0,0], 楽天市場:[0,0,0] },
    annualSales: emptyAnnual(),
    stock:{ FBA:0, 国内倉庫:0, 楽天ロジ:0 },
    orderingMfg:0, orderingShip:0,
    orderQty:1000, mfgLeadDays:45, shippingDays:30,
    reorderPoint:300, bufferDays:14, stockUpdatedAt:null,
    unitCost:0, unitPrice:0, color:COLOR_AMZ,
  };

  const NAV_TABS = [
    { key:"inventory", label:"📦 在庫管理" },
    { key:"sales",     label:"📊 販売実績" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6", color:"#111827", fontFamily:FONT }}>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #e5e7eb", padding:"16px 28px", display:"flex",
        alignItems:"center", justifyContent:"space-between", background:"#fff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"32px" }}>
          <div>
            <div style={{ fontSize:"11px", color:COLOR_AMZ, letterSpacing:"3px",
              textTransform:"uppercase", fontWeight:"600" }}>Linowa LLC</div>
            <div style={{ fontSize:"20px", fontWeight:"700", color:"#111827" }}>在庫管理システム</div>
          </div>
          {/* ナビタブ */}
          <div style={{ display:"flex", gap:"2px", background:"#f3f4f6",
            borderRadius:"10px", padding:"4px" }}>
            {NAV_TABS.map(tab => (
              <button key={tab.key} onClick={() => setView(tab.key)} style={{
                padding:"8px 18px", background: view===tab.key ? "#fff" : "transparent",
                border:"none", borderRadius:"8px",
                color: view===tab.key ? "#111827" : "#9ca3af",
                cursor:"pointer", fontFamily:FONT, fontSize:"13px",
                fontWeight: view===tab.key ? "600" : "400",
                boxShadow: view===tab.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition:"all 0.15s",
              }}>{tab.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
          <div style={{ fontSize:"13px", color:"#9ca3af" }}>
            {now.toLocaleDateString("ja-JP", { year:"numeric", month:"long", day:"numeric" })}
          </div>
          {view === "inventory" && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"6px" }}>
              <div style={{ display:"flex", gap:"10px" }}>
                <button onClick={() => setShowFbaUpload(true)} style={{
                  padding:"10px 20px", background:"#fff", border:"1px solid #d1d5db",
                  borderRadius:"8px", color:"#374151", cursor:"pointer",
                  fontFamily:FONT, fontSize:"13px", fontWeight:"600" }}>
                  📊 FBA CSV更新
                </button>
                <button onClick={() => setEditProduct(newProduct)} style={{
                  padding:"10px 20px", background:COLOR_AMZ, border:"none",
                  borderRadius:"8px", color:"#fff", cursor:"pointer",
                  fontFamily:FONT, fontSize:"13px", fontWeight:"600" }}>
                  + 製品追加
                </button>
              </div>
              {fbaUpdatedAt && (
                <div style={{ fontSize:"11px", color:"#9ca3af" }}>
                  FBA在庫更新日：{fmtDateTime(new Date(fbaUpdatedAt))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ビュー切り替え */}
      {view === "inventory" && (
        <InventoryView
          products={products} now={now}
          onEdit={setEditProduct} onDelete={deleteProduct}
          filter={filter} setFilter={setFilter}
        />
      )}
      {view === "sales" && (
        <SalesView products={products} onUpdateAnnualSales={updateAnnualSales} now={now} />
      )}

      {editProduct && (
        <ProductModal product={editProduct} onSave={saveProduct} onClose={() => setEditProduct(null)} />
      )}
      {showFbaUpload && (
        <FbaUploadModal
          products={products}
          onUpdate={updateFbaStock}
          onClose={() => setShowFbaUpload(false)}
        />
      )}
    </div>
  );
}
