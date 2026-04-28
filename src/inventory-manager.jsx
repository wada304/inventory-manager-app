import React, { useState, useEffect, useCallback } from "react";

const CHANNELS = ["Amazon", "楽天市場"];
const STORAGE_KEY = "linowa_inventory_v3";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const GRID_COLS = "112px 1fr 130px 88px 170px 105px 105px 76px";

const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "HYPE GUARD フィギュアケース①",
    sku: "HG-001",
    asin: "",
    jan: "",
    monthlySales: { Amazon: [180, 180, 180], 楽天市場: [60, 60, 60] },
    stock: { FBA: 320, 国内倉庫: 800, 楽天ロジ: 0 },
    orderingMfg: 0,
    orderingShip: 0,
    orderQty: 2000,
    mfgLeadDays: 45,
    shippingDays: 30,
    reorderPoint: 800,
    bufferDays: 14,
    stockUpdatedAt: null,
    unitCost: 2800,
    unitPrice: 8980,
    color: "#e8622a",
  },
  {
    id: 2,
    name: "HYPE GUARD スニーカーケース③",
    sku: "HG-003",
    asin: "",
    jan: "",
    monthlySales: { Amazon: [90, 90, 90], 楽天市場: [30, 30, 30] },
    stock: { FBA: 150, 国内倉庫: 200, 楽天ロジ: 0 },
    orderingMfg: 0,
    orderingShip: 0,
    orderQty: 2000,
    mfgLeadDays: 45,
    shippingDays: 30,
    reorderPoint: 800,
    bufferDays: 14,
    stockUpdatedAt: null,
    unitCost: 3200,
    unitPrice: 10980,
    color: "#2a7ae8",
  },
  {
    id: 3,
    name: "GLENOA 水耕栽培LEDライト",
    sku: "HGS02-2CD",
    asin: "",
    jan: "",
    monthlySales: { Amazon: [0, 0, 0], 楽天市場: [0, 0, 0] },
    stock: { FBA: 0, 国内倉庫: 300, 楽天ロジ: 0 },
    orderingMfg: 0,
    orderingShip: 0,
    orderQty: 500,
    mfgLeadDays: 60,
    shippingDays: 35,
    reorderPoint: 150,
    bufferDays: 14,
    stockUpdatedAt: null,
    unitCost: 6800,
    unitPrice: 24800,
    color: "#2ae87a",
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
function getStock(s) {
  return (s.FBA || 0) + (s.国内倉庫 || 0) + (s.楽天ロジ || 0);
}
function getEffectiveStock(product) {
  return getStock(product.stock) + (product.orderingMfg || 0) + (product.orderingShip || 0);
}
function calcLeadDays(product) {
  return product.mfgLeadDays + product.shippingDays;
}
function calcAlertLevel(product) {
  const effectiveStock = getEffectiveStock(product);
  const avg = totalAvgSales(product);
  if (avg === 0) return "none";
  const dos = Math.round((effectiveStock / avg) * 30);
  const lead = calcLeadDays(product);
  const reorderDays = (product.reorderPoint / avg) * 30 + lead;
  if (dos <= lead) return "critical";
  if (dos <= reorderDays) return "warning";
  if (dos <= reorderDays * 1.3) return "caution";
  return "ok";
}
function calcOrderDeadlineDays(product) {
  const avg = totalAvgSales(product);
  if (avg === 0) return null;
  const effectiveStock = getEffectiveStock(product);
  const lead = calcLeadDays(product);
  return Math.round(((effectiveStock - product.reorderPoint) / avg) * 30 - lead);
}
function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
function getStockUpdateInfo(stockUpdatedAt, now) {
  if (!stockUpdatedAt) return null;
  const updated = new Date(stockUpdatedAt);
  const diffDays = Math.floor((now - updated) / (1000 * 60 * 60 * 24));
  return { label: fmtDate(updated), needsUpdate: diffDays >= 7 };
}

const ALERT_CONFIG = {
  critical: { label: "今すぐ発注", bg: "#dc2626", icon: "🚨" },
  warning:  { label: "要発注",     bg: "#ea580c", icon: "⚠️" },
  caution:  { label: "注意",       bg: "#ca8a04", icon: "⚡" },
  ok:       { label: "正常",       bg: "#16a34a", icon: "✓" },
  none:     { label: "販売なし",   bg: "#9ca3af", icon: "—" },
};

// ── サブコンポーネント ─────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      borderTop: "1px solid #e5e7eb", paddingTop: "16px",
      color: "#6b7280", fontSize: "11px", letterSpacing: "1px",
      textTransform: "uppercase", fontWeight: "600",
    }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span style={{ color: "#6b7280", fontSize: "11px", fontWeight: "500" }}>{label}</span>
      {React.cloneElement(children, {
        style: {
          background: "#f9fafb", border: "1px solid #d1d5db", borderRadius: "6px",
          padding: "8px 12px", color: "#111827", fontFamily: FONT, fontSize: "14px",
          width: "100%", outline: "none", boxSizing: "border-box",
          ...children.props.style,
        },
      })}
    </label>
  );
}

function SalesGrid({ monthlySales, onChange }) {
  const setMonth = (ch, idx, val) => {
    const arr = [...monthlySales[ch]];
    arr[idx] = Number(val);
    onChange({ ...monthlySales, [ch]: arr });
  };
  const INPUT_S = {
    background: "#f9fafb", border: "1px solid #d1d5db", borderRadius: "6px",
    padding: "7px 8px", color: "#111827", fontFamily: FONT, fontSize: "13px",
    width: "100%", outline: "none", boxSizing: "border-box", textAlign: "right",
  };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 52px", gap: "6px", marginBottom: "6px" }}>
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
                onChange={e => setMonth(ch, i, e.target.value)} style={INPUT_S} />
            ))}
            <div style={{ textAlign:"center", fontSize:"13px", fontWeight:"700", color:"#e8622a" }}>{avg}</div>
          </div>
        );
      })}
      <div style={{ fontSize:"11px", color:"#9ca3af", marginTop:"2px" }}>
        ※ 平均値をアラート判定に使用します
      </div>
    </div>
  );
}

function ProductModal({ product, onSave, onClose, now }) {
  const [form, setForm] = useState(() => ({
    asin: "", jan: "", bufferDays: 14, stockUpdatedAt: null,
    orderingMfg: 0, orderingShip: 0,
    ...product,
    monthlySales: {
      Amazon: Array.isArray(product.monthlySales?.Amazon)
        ? product.monthlySales.Amazon
        : [product.monthlySales?.Amazon ?? 0, product.monthlySales?.Amazon ?? 0, product.monthlySales?.Amazon ?? 0],
      楽天市場: Array.isArray(product.monthlySales?.楽天市場)
        ? product.monthlySales.楽天市場
        : [product.monthlySales?.楽天市場 ?? 0, product.monthlySales?.楽天市場 ?? 0, product.monthlySales?.楽天市場 ?? 0],
    },
    stock: { FBA: 0, 国内倉庫: 0, 楽天ロジ: 0, ...product.stock },
  }));

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setNested = (parent, key, val) => setForm(f => ({ ...f, [parent]: { ...f[parent], [key]: val } }));

  const calcSafetyStock = () => {
    const dailyAvg = totalAvgSales(form) / 30;
    const lead = (form.mfgLeadDays || 0) + (form.shippingDays || 0);
    set("reorderPoint", Math.round(dailyAvg * (lead + (form.bufferDays || 0))));
  };

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)",
        zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}
      onClick={onClose}
    >
      <div
        style={{ background:"#ffffff", border:"1px solid #e5e7eb", borderRadius:"16px", padding:"32px",
          width:"100%", maxWidth:"600px", maxHeight:"90vh", overflowY:"auto", fontFamily:FONT,
          boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"24px" }}>
          <h2 style={{ color:"#111827", fontSize:"18px", margin:0, fontWeight:"700" }}>
            {product.id ? "製品編集" : "新規製品"}
          </h2>
          <button onClick={onClose}
            style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:"20px" }}>✕</button>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
          <Field label="製品名">
            <input value={form.name} onChange={e => set("name", e.target.value)} />
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
            <Field label="SKU"><input value={form.sku} onChange={e => set("sku", e.target.value)} /></Field>
            <Field label="ASIN"><input value={form.asin} onChange={e => set("asin", e.target.value)} placeholder="B0XXXXXXXXX" /></Field>
            <Field label="JANコード"><input value={form.jan} onChange={e => set("jan", e.target.value)} placeholder="4900000000000" /></Field>
          </div>

          <SectionLabel>月間販売数（直近3ヶ月）</SectionLabel>
          <SalesGrid monthlySales={form.monthlySales} onChange={val => set("monthlySales", val)} />

          <SectionLabel>在庫数</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:"12px" }}>
            <Field label="Amazon FBA">
              <input type="number" value={form.stock.FBA} onChange={e => setNested("stock","FBA",Number(e.target.value))} />
            </Field>
            <Field label="国内倉庫">
              <input type="number" value={form.stock.国内倉庫} onChange={e => setNested("stock","国内倉庫",Number(e.target.value))} />
            </Field>
            <Field label="楽天ロジ">
              <input type="number" value={form.stock.楽天ロジ} onChange={e => setNested("stock","楽天ロジ",Number(e.target.value))} />
            </Field>
            <Field label="在庫更新日">
              <input type="date" value={form.stockUpdatedAt || ""}
                onChange={e => set("stockUpdatedAt", e.target.value || null)}
                style={{ textAlign:"left" }} />
            </Field>
          </div>

          <SectionLabel>発注中</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
            <Field label="製造中（個）">
              <input type="number" min="0" value={form.orderingMfg} onChange={e => set("orderingMfg", Number(e.target.value))} />
            </Field>
            <Field label="輸送中（個）">
              <input type="number" min="0" value={form.orderingShip} onChange={e => set("orderingShip", Number(e.target.value))} />
            </Field>
          </div>

          <SectionLabel>発注設定</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
            <Field label="発注ロット数">
              <input type="number" value={form.orderQty} onChange={e => set("orderQty", Number(e.target.value))} />
            </Field>
            <Field label="安全在庫数">
              <input type="number" value={form.reorderPoint} onChange={e => set("reorderPoint", Number(e.target.value))} />
            </Field>
            <Field label="予備日数（バッファ）">
              <input type="number" min="0" value={form.bufferDays} onChange={e => set("bufferDays", Number(e.target.value))} />
            </Field>
          </div>
          <button onClick={calcSafetyStock} style={{
            padding:"9px 18px", background:"#eff6ff", border:"1px solid #93c5fd",
            borderRadius:"8px", color:"#1d4ed8", cursor:"pointer", fontFamily:FONT,
            fontSize:"13px", fontWeight:"600", alignSelf:"flex-start",
          }}>
            ⚙️ 安全在庫を自動計算
          </button>
          <div style={{ fontSize:"11px", color:"#9ca3af", marginTop:"-8px" }}>
            計算式：日次平均販売数 × (リードタイム + 予備日数)
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
            <Field label="製造リードタイム(日)">
              <input type="number" value={form.mfgLeadDays} onChange={e => set("mfgLeadDays", Number(e.target.value))} />
            </Field>
            <Field label="輸送日数(日)">
              <input type="number" value={form.shippingDays} onChange={e => set("shippingDays", Number(e.target.value))} />
            </Field>
          </div>

          <SectionLabel>価格</SectionLabel>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
            <Field label="仕入原価(円)">
              <input type="number" value={form.unitCost} onChange={e => set("unitCost", Number(e.target.value))} />
            </Field>
            <Field label="販売価格(円)">
              <input type="number" value={form.unitPrice} onChange={e => set("unitPrice", Number(e.target.value))} />
            </Field>
          </div>
        </div>

        <div style={{ marginTop:"24px", display:"flex", gap:"12px", justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{
            padding:"10px 24px", background:"transparent", border:"1px solid #d1d5db",
            borderRadius:"8px", color:"#374151", cursor:"pointer", fontFamily:FONT, fontSize:"14px",
          }}>キャンセル</button>
          <button onClick={() => onSave(form)} style={{
            padding:"10px 24px", background: form.color || "#e8622a", border:"none",
            borderRadius:"8px", color:"#fff", cursor:"pointer", fontFamily:FONT,
            fontSize:"14px", fontWeight:"600",
          }}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────
export default function InventoryManager() {
  const [products, setProducts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_PRODUCTS;
    } catch { return DEFAULT_PRODUCTS; }
  });
  const [editProduct, setEditProduct] = useState(null);
  const [filter, setFilter] = useState("all");
  const [now] = useState(new Date());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(products)); } catch {}
  }, [products]);

  const saveProduct = useCallback((form) => {
    setProducts(prev => form.id ? prev.map(p => p.id === form.id ? form : p) : [...prev, { ...form, id: Date.now() }]);
    setEditProduct(null);
  }, []);

  const deleteProduct = id => {
    if (confirm("この製品を削除しますか？")) setProducts(prev => prev.filter(p => p.id !== id));
  };

  const newProduct = {
    id: null, name: "", sku: "", asin: "", jan: "",
    monthlySales: { Amazon: [0,0,0], 楽天市場: [0,0,0] },
    stock: { FBA: 0, 国内倉庫: 0, 楽天ロジ: 0 },
    orderingMfg: 0, orderingShip: 0,
    orderQty: 1000, mfgLeadDays: 45, shippingDays: 30,
    reorderPoint: 300, bufferDays: 14, stockUpdatedAt: null,
    unitCost: 0, unitPrice: 0, color: "#e8622a",
  };

  const alerts = products.filter(p => { const l = calcAlertLevel(p); return l === "critical" || l === "warning"; });
  const filtered = filter === "all" ? products : products.filter(p => calcAlertLevel(p) === filter);
  const totalStockValue = products.reduce((sum, p) => sum + getStock(p.stock) * p.unitCost, 0);
  const totalMonthlyAvg = products.reduce((s, p) => s + Math.round(totalAvgSales(p)), 0);

  return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6", color:"#111827", fontFamily:FONT }}>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #e5e7eb", padding:"20px 28px", display:"flex",
        alignItems:"center", justifyContent:"space-between", background:"#ffffff" }}>
        <div>
          <div style={{ fontSize:"11px", color:"#e8622a", letterSpacing:"3px",
            textTransform:"uppercase", marginBottom:"4px", fontWeight:"600" }}>Linowa LLC</div>
          <div style={{ fontSize:"22px", fontWeight:"700", color:"#111827" }}>在庫管理システム</div>
        </div>
        <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
          <div style={{ fontSize:"13px", color:"#9ca3af" }}>
            {now.toLocaleDateString("ja-JP", { year:"numeric", month:"long", day:"numeric" })}
          </div>
          <button onClick={() => setEditProduct(newProduct)} style={{
            padding:"10px 20px", background:"#e8622a", border:"none", borderRadius:"8px",
            color:"#fff", cursor:"pointer", fontFamily:FONT, fontSize:"13px", fontWeight:"600",
          }}>+ 製品追加</button>
        </div>
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div style={{ background:"#fff1f2", borderBottom:"1px solid #fecaca", padding:"12px 28px",
          display:"flex", gap:"8px", alignItems:"center", overflowX:"auto" }}>
          <span style={{ fontSize:"15px" }}>🚨</span>
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
          { label:"管理製品数",        value:products.length,                              unit:"SKU", color:"#e8622a" },
          { label:"アラート発生",      value:alerts.length,                                unit:"件",  color:alerts.length>0?"#dc2626":"#16a34a" },
          { label:"在庫総額",          value:`¥${(totalStockValue/10000).toFixed(1)}万`,  unit:"",    color:"#2563eb" },
          { label:"月平均販売(3ヶ月)", value:totalMonthlyAvg.toLocaleString(),             unit:"個",  color:"#7c3aed" },
        ].map(card => (
          <div key={card.label} style={{ background:"#ffffff", padding:"20px 24px" }}>
            <div style={{ color:"#9ca3af", fontSize:"11px", fontWeight:"500",
              textTransform:"uppercase", marginBottom:"8px" }}>{card.label}</div>
            <div style={{ color:card.color, fontSize:"28px", fontWeight:"700" }}>
              {card.value}
              <span style={{ fontSize:"14px", fontWeight:"400", marginLeft:"4px" }}>{card.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ padding:"0 28px", display:"flex", gap:"4px",
        borderBottom:"1px solid #e5e7eb", background:"#ffffff" }}>
        {[
          { key:"all",      label:"すべて" },
          { key:"critical", label:"🚨 今すぐ発注" },
          { key:"warning",  label:"⚠️ 要発注" },
          { key:"caution",  label:"⚡ 注意" },
          { key:"ok",       label:"✓ 正常" },
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
        {/* Table Header */}
        <div style={{
          display:"grid", gridTemplateColumns:GRID_COLS, gap:"0",
          background:"#f9fafb", border:"1px solid #e5e7eb",
          borderRadius:"10px 10px 0 0", padding:"10px 16px",
          fontSize:"11px", color:"#6b7280", fontWeight:"600",
          letterSpacing:"0.5px", textTransform:"uppercase",
        }}>
          <div>ステータス</div>
          <div>製品名</div>
          <div style={{ textAlign:"right" }}>在庫数</div>
          <div style={{ textAlign:"right" }}>月販数</div>
          <div style={{ textAlign:"center" }}>発注中</div>
          <div style={{ textAlign:"center" }}>発注期限日</div>
          <div style={{ textAlign:"center" }}>入荷予定日</div>
          <div />
        </div>

        {/* Product Rows */}
        <div style={{ border:"1px solid #e5e7eb", borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden" }}>
          {filtered.map((product, idx) => {
            const level = calcAlertLevel(product);
            const alert = ALERT_CONFIG[level];
            const totalStock = getStock(product.stock);
            const avgAmz = Math.round(avgSales(product.monthlySales.Amazon));
            const avgRak = Math.round(avgSales(product.monthlySales.楽天市場));
            const avgTotal = avgAmz + avgRak;
            const deadlineDays = calcOrderDeadlineDays(product);
            const updateInfo = getStockUpdateInfo(product.stockUpdatedAt, now);
            const hasOrdering = (product.orderingMfg || 0) + (product.orderingShip || 0) > 0;

            const deadlineDate = deadlineDays !== null
              ? fmtDate(addDays(now, deadlineDays))
              : null;
            const deadlineColor = deadlineDays === null ? "#9ca3af"
              : deadlineDays <= 0 ? "#dc2626"
              : deadlineDays <= 14 ? "#ea580c"
              : "#374151";
            const deadlineLabel = deadlineDays === null ? "—"
              : deadlineDays <= 0 ? "超過"
              : deadlineDate;

            const arrivalDate = fmtDate(addDays(now, calcLeadDays(product)));

            return (
              <div
                key={product.id}
                style={{
                  display:"grid", gridTemplateColumns:GRID_COLS, gap:"0",
                  padding:"14px 16px", alignItems:"center",
                  background: idx % 2 === 0 ? "#ffffff" : "#fafafa",
                  borderTop: idx === 0 ? "none" : "1px solid #f3f4f6",
                  borderLeft:`3px solid ${alert.bg}`,
                  transition:"background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f0f9ff"}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#ffffff" : "#fafafa"}
              >
                {/* ステータス */}
                <div>
                  <span style={{
                    display:"inline-flex", alignItems:"center", gap:"4px",
                    padding:"3px 8px", borderRadius:"4px",
                    background: alert.bg + "18", border:`1px solid ${alert.bg}44`,
                    color: alert.bg, fontSize:"11px", fontWeight:"700", whiteSpace:"nowrap",
                  }}>
                    {alert.icon} {alert.label}
                  </span>
                </div>

                {/* 製品名 */}
                <div style={{ minWidth:0, paddingRight:"12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"6px", flexWrap:"wrap" }}>
                    <span style={{
                      width:"7px", height:"7px", borderRadius:"50%",
                      background:product.color, flexShrink:0, display:"inline-block",
                    }} />
                    <span style={{ fontSize:"13px", fontWeight:"600", color:"#111827",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {product.name}
                    </span>
                    {updateInfo?.needsUpdate && (
                      <span style={{ background:"#fef3c7", border:"1px solid #fcd34d",
                        borderRadius:"3px", padding:"1px 5px", color:"#92400e",
                        fontSize:"10px", fontWeight:"700", flexShrink:0 }}>要更新</span>
                    )}
                  </div>
                  <div style={{ fontSize:"11px", color:"#9ca3af", marginTop:"2px", paddingLeft:"13px" }}>
                    {product.sku && <span>{product.sku}</span>}
                    {product.asin && <span style={{ marginLeft:"8px" }}>ASIN:{product.asin}</span>}
                  </div>
                </div>

                {/* 在庫数 */}
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"16px", fontWeight:"700", color:"#111827" }}>
                    {totalStock.toLocaleString()}
                    <span style={{ fontSize:"11px", fontWeight:"400", color:"#9ca3af", marginLeft:"2px" }}>個</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"2px" }}>
                    FBA {product.stock.FBA} / 倉 {product.stock.国内倉庫} / 楽 {product.stock.楽天ロジ||0}
                  </div>
                </div>

                {/* 月販数 */}
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"16px", fontWeight:"700", color:"#374151" }}>
                    {avgTotal}
                    <span style={{ fontSize:"11px", fontWeight:"400", color:"#9ca3af", marginLeft:"2px" }}>個</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"2px" }}>
                    AMZ {avgAmz} / 楽 {avgRak}
                  </div>
                </div>

                {/* 発注中 */}
                <div style={{ textAlign:"center" }}>
                  {hasOrdering ? (
                    <div style={{ fontSize:"11px", color:"#374151", lineHeight:"1.6" }}>
                      <div>製造中 <strong style={{ color:"#2563eb" }}>{(product.orderingMfg||0).toLocaleString()}</strong>個</div>
                      <div>輸送中 <strong style={{ color:"#7c3aed" }}>{(product.orderingShip||0).toLocaleString()}</strong>個</div>
                    </div>
                  ) : (
                    <span style={{ fontSize:"12px", color:"#d1d5db" }}>—</span>
                  )}
                </div>

                {/* 発注期限日 */}
                <div style={{ textAlign:"center" }}>
                  <span style={{ fontSize:"13px", fontWeight:"700", color:deadlineColor }}>
                    {deadlineLabel}
                  </span>
                  {deadlineDays !== null && deadlineDays > 0 && (
                    <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"2px" }}>
                      ({deadlineDays}日後)
                    </div>
                  )}
                </div>

                {/* 入荷予定日 */}
                <div style={{ textAlign:"center" }}>
                  <span style={{ fontSize:"13px", fontWeight:"600", color:"#374151" }}>
                    {avgTotal === 0 ? "—" : arrivalDate}
                  </span>
                  {avgTotal > 0 && (
                    <div style={{ fontSize:"10px", color:"#9ca3af", marginTop:"2px" }}>
                      ({calcLeadDays(product)}日後)
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display:"flex", flexDirection:"column", gap:"4px", alignItems:"flex-end" }}>
                  <button onClick={() => setEditProduct(product)} style={{
                    padding:"5px 12px", background:"transparent", border:"1px solid #d1d5db",
                    borderRadius:"5px", color:"#374151", cursor:"pointer",
                    fontFamily:FONT, fontSize:"12px", whiteSpace:"nowrap",
                  }}>編集</button>
                  <button onClick={() => deleteProduct(product.id)} style={{
                    padding:"5px 12px", background:"transparent", border:"1px solid #f3f4f6",
                    borderRadius:"5px", color:"#d1d5db", cursor:"pointer",
                    fontFamily:FONT, fontSize:"12px",
                  }}>削除</button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px", color:"#d1d5db", fontSize:"14px", background:"#ffffff" }}>
              該当する製品はありません
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding:"14px 28px", borderTop:"1px solid #e5e7eb", display:"flex", gap:"20px",
        fontSize:"11px", color:"#9ca3af", flexWrap:"wrap", background:"#ffffff" }}>
        <span style={{ color:"#6b7280", fontWeight:"600" }}>アラート基準（実在庫＋発注中で計算）</span>
        <span>🚨 今すぐ発注 = 有効在庫日数 ≤ リードタイム</span>
        <span>⚠️ 要発注 = 有効在庫日数 ≤ リードタイム + 安全在庫日数</span>
        <span>⚡ 注意 = 上記の1.3倍以内</span>
        <span>* データはブラウザに保存されます</span>
        <span style={{ marginLeft:"auto", color:"#d1d5db" }}>v1.2.0</span>
      </div>

      {editProduct && (
        <ProductModal product={editProduct} onSave={saveProduct}
          onClose={() => setEditProduct(null)} now={now} />
      )}
    </div>
  );
}
