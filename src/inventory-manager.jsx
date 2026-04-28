import React, { useState, useEffect, useCallback } from "react";

const CHANNELS = ["Amazon", "楽天市場"];
const STORAGE_KEY = "linowa_inventory_v3";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "HYPE GUARD フィギュアケース①",
    sku: "HG-001",
    asin: "",
    jan: "",
    monthlySales: { Amazon: [180, 180, 180], 楽天市場: [60, 60, 60] },
    stock: { FBA: 320, 国内倉庫: 800, 楽天ロジ: 0 },
    orderQty: 2000,
    mfgLeadDays: 45,
    shippingDays: 30,
    reorderPoint: 800,
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
    orderQty: 2000,
    mfgLeadDays: 45,
    shippingDays: 30,
    reorderPoint: 800,
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
    orderQty: 500,
    mfgLeadDays: 60,
    shippingDays: 35,
    reorderPoint: 150,
    unitCost: 6800,
    unitPrice: 24800,
    color: "#2ae87a",
  },
];

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

function calcDaysOfStock(product) {
  const totalStock = getStock(product.stock);
  const avg = totalAvgSales(product);
  if (avg === 0) return Infinity;
  return Math.round((totalStock / avg) * 30);
}

function calcLeadDays(product) {
  return product.mfgLeadDays + product.shippingDays;
}

function calcAlertLevel(product) {
  const dos = calcDaysOfStock(product);
  const lead = calcLeadDays(product);
  const avg = totalAvgSales(product);
  if (avg === 0) return "none";
  const reorderDays = (product.reorderPoint / avg) * 30 + lead;
  if (dos <= lead) return "critical";
  if (dos <= reorderDays) return "warning";
  if (dos <= reorderDays * 1.3) return "caution";
  return "ok";
}

function calcOrderDeadline(product) {
  const avg = totalAvgSales(product);
  if (avg === 0) return null;
  const totalStock = getStock(product.stock);
  const lead = calcLeadDays(product);
  return Math.round(((totalStock - product.reorderPoint) / avg) * 30 - lead);
}

const ALERT_CONFIG = {
  critical: { label: "今すぐ発注", bg: "#dc2626", icon: "🚨" },
  warning:  { label: "要発注",     bg: "#ea580c", icon: "⚠️" },
  caution:  { label: "注意",       bg: "#ca8a04", icon: "⚡" },
  ok:       { label: "正常",       bg: "#16a34a", icon: "✓" },
  none:     { label: "販売なし",   bg: "#9ca3af", icon: "—" },
};

const INPUT_STYLE = {
  background: "#f9fafb",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  padding: "7px 8px",
  color: "#111827",
  fontFamily: FONT,
  fontSize: "13px",
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
  textAlign: "right",
};

function SectionLabel({ children }) {
  return (
    <div
      style={{
        borderTop: "1px solid #e5e7eb",
        paddingTop: "16px",
        color: "#6b7280",
        fontSize: "11px",
        letterSpacing: "1px",
        textTransform: "uppercase",
        fontWeight: "600",
      }}
    >
      {children}
    </div>
  );
}

function SalesGrid({ monthlySales, onChange }) {
  const setMonth = (ch, idx, val) => {
    const arr = [...monthlySales[ch]];
    arr[idx] = Number(val);
    onChange({ ...monthlySales, [ch]: arr });
  };

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "90px 1fr 1fr 1fr 52px",
          gap: "6px",
          marginBottom: "6px",
        }}
      >
        <div />
        {["月1", "月2", "月3"].map((m) => (
          <div key={m} style={{ textAlign: "center", fontSize: "11px", color: "#9ca3af" }}>
            {m}
          </div>
        ))}
        <div style={{ textAlign: "center", fontSize: "11px", color: "#9ca3af" }}>平均</div>
      </div>
      {CHANNELS.map((ch) => {
        const avg = Math.round(avgSales(monthlySales[ch]));
        return (
          <div
            key={ch}
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 1fr 1fr 52px",
              gap: "6px",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <div style={{ fontSize: "13px", color: "#374151", fontWeight: "500" }}>{ch}</div>
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                type="number"
                min="0"
                value={monthlySales[ch][i]}
                onChange={(e) => setMonth(ch, i, e.target.value)}
                style={INPUT_STYLE}
              />
            ))}
            <div style={{ textAlign: "center", fontSize: "13px", fontWeight: "700", color: "#e8622a" }}>
              {avg}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
        ※ 平均値を在庫日数・アラート判定に使用します
      </div>
    </div>
  );
}

function ProductModal({ product, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    asin: "",
    jan: "",
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

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setNested = (parent, key, val) =>
    setForm((f) => ({ ...f, [parent]: { ...f[parent], [key]: val } }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "32px",
          width: "100%",
          maxWidth: "580px",
          maxHeight: "90vh",
          overflowY: "auto",
          fontFamily: FONT,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h2 style={{ color: "#111827", fontSize: "18px", margin: 0, fontWeight: "700" }}>
            {product.id ? "製品編集" : "新規製品"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "20px" }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Field label="製品名">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <Field label="SKU">
              <input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </Field>
            <Field label="ASIN">
              <input value={form.asin} onChange={(e) => set("asin", e.target.value)} placeholder="B0XXXXXXXXX" />
            </Field>
            <Field label="JANコード">
              <input value={form.jan} onChange={(e) => set("jan", e.target.value)} placeholder="4900000000000" />
            </Field>
          </div>

          <SectionLabel>月間販売数（直近3ヶ月）</SectionLabel>
          <SalesGrid
            monthlySales={form.monthlySales}
            onChange={(val) => set("monthlySales", val)}
          />

          <SectionLabel>在庫数</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <Field label="Amazon FBA">
              <input
                type="number"
                value={form.stock.FBA}
                onChange={(e) => setNested("stock", "FBA", Number(e.target.value))}
              />
            </Field>
            <Field label="国内倉庫">
              <input
                type="number"
                value={form.stock.国内倉庫}
                onChange={(e) => setNested("stock", "国内倉庫", Number(e.target.value))}
              />
            </Field>
            <Field label="楽天ロジ">
              <input
                type="number"
                value={form.stock.楽天ロジ}
                onChange={(e) => setNested("stock", "楽天ロジ", Number(e.target.value))}
              />
            </Field>
          </div>

          <SectionLabel>発注設定</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field label="発注ロット数">
              <input
                type="number"
                value={form.orderQty}
                onChange={(e) => set("orderQty", Number(e.target.value))}
              />
            </Field>
            <Field label="安全在庫数">
              <input
                type="number"
                value={form.reorderPoint}
                onChange={(e) => set("reorderPoint", Number(e.target.value))}
              />
            </Field>
            <Field label="製造リードタイム(日)">
              <input
                type="number"
                value={form.mfgLeadDays}
                onChange={(e) => set("mfgLeadDays", Number(e.target.value))}
              />
            </Field>
            <Field label="輸送日数(日)">
              <input
                type="number"
                value={form.shippingDays}
                onChange={(e) => set("shippingDays", Number(e.target.value))}
              />
            </Field>
          </div>

          <SectionLabel>価格</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field label="仕入原価(円)">
              <input
                type="number"
                value={form.unitCost}
                onChange={(e) => set("unitCost", Number(e.target.value))}
              />
            </Field>
            <Field label="販売価格(円)">
              <input
                type="number"
                value={form.unitPrice}
                onChange={(e) => set("unitPrice", Number(e.target.value))}
              />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: "24px", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px",
              background: "transparent",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              color: "#374151",
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: "14px",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={() => onSave(form)}
            style={{
              padding: "10px 24px",
              background: form.color || "#e8622a",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span style={{ color: "#6b7280", fontSize: "11px", fontWeight: "500" }}>{label}</span>
      {React.cloneElement(children, {
        style: {
          background: "#f9fafb",
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          padding: "8px 12px",
          color: "#111827",
          fontFamily: FONT,
          fontSize: "14px",
          width: "100%",
          outline: "none",
          boxSizing: "border-box",
        },
      })}
    </label>
  );
}

export default function InventoryManager() {
  const [products, setProducts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_PRODUCTS;
    } catch {
      return DEFAULT_PRODUCTS;
    }
  });
  const [editProduct, setEditProduct] = useState(null);
  const [filter, setFilter] = useState("all");
  const [now] = useState(new Date());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    } catch {}
  }, [products]);

  const saveProduct = useCallback((form) => {
    setProducts((prev) => {
      if (form.id) return prev.map((p) => (p.id === form.id ? form : p));
      return [...prev, { ...form, id: Date.now() }];
    });
    setEditProduct(null);
  }, []);

  const deleteProduct = (id) => {
    if (confirm("この製品を削除しますか？")) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const newProduct = {
    id: null,
    name: "",
    sku: "",
    asin: "",
    jan: "",
    monthlySales: { Amazon: [0, 0, 0], 楽天市場: [0, 0, 0] },
    stock: { FBA: 0, 国内倉庫: 0, 楽天ロジ: 0 },
    orderQty: 1000,
    mfgLeadDays: 45,
    shippingDays: 30,
    reorderPoint: 300,
    unitCost: 0,
    unitPrice: 0,
    color: "#e8622a",
  };

  const alerts = products.filter((p) => {
    const lvl = calcAlertLevel(p);
    return lvl === "critical" || lvl === "warning";
  });

  const filtered =
    filter === "all"
      ? products
      : products.filter((p) => calcAlertLevel(p) === filter);

  const totalStockValue = products.reduce(
    (sum, p) => sum + getStock(p.stock) * p.unitCost,
    0
  );

  const totalMonthlyAvg = products.reduce(
    (s, p) => s + Math.round(totalAvgSales(p)),
    0
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        color: "#111827",
        fontFamily: FONT,
        padding: "0",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid #e5e7eb",
          padding: "20px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#ffffff",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#e8622a",
              letterSpacing: "3px",
              textTransform: "uppercase",
              marginBottom: "4px",
              fontWeight: "600",
            }}
          >
            Linowa LLC
          </div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#111827" }}>
            在庫管理システム
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>
            {now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
          </div>
          <button
            onClick={() => setEditProduct(newProduct)}
            style={{
              padding: "10px 20px",
              background: "#e8622a",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            + 製品追加
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div
          style={{
            background: "#fff1f2",
            borderBottom: "1px solid #fecaca",
            padding: "12px 28px",
            display: "flex",
            gap: "8px",
            alignItems: "center",
            overflowX: "auto",
          }}
        >
          <span style={{ fontSize: "15px" }}>🚨</span>
          <span
            style={{
              color: "#dc2626",
              fontSize: "12px",
              fontWeight: "700",
              whiteSpace: "nowrap",
            }}
          >
            発注アラート:
          </span>
          {alerts.map((p) => (
            <span
              key={p.id}
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: "4px",
                padding: "3px 10px",
                color: "#dc2626",
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1px",
          background: "#e5e7eb",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {[
          { label: "管理製品数",        value: products.length,                              unit: "SKU", color: "#e8622a" },
          { label: "アラート発生",      value: alerts.length,                                unit: "件",  color: alerts.length > 0 ? "#dc2626" : "#16a34a" },
          { label: "在庫総額",          value: `¥${(totalStockValue / 10000).toFixed(1)}万`, unit: "",    color: "#2563eb" },
          { label: "月平均販売(3ヶ月)", value: totalMonthlyAvg.toLocaleString(),             unit: "個",  color: "#7c3aed" },
        ].map((card) => (
          <div key={card.label} style={{ background: "#ffffff", padding: "20px 24px" }}>
            <div
              style={{
                color: "#9ca3af",
                fontSize: "11px",
                fontWeight: "500",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}
            >
              {card.label}
            </div>
            <div style={{ color: card.color, fontSize: "28px", fontWeight: "700" }}>
              {card.value}
              <span style={{ fontSize: "14px", fontWeight: "400", marginLeft: "4px" }}>{card.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          padding: "0 28px",
          display: "flex",
          gap: "4px",
          borderBottom: "1px solid #e5e7eb",
          background: "#ffffff",
        }}
      >
        {[
          { key: "all",      label: "すべて" },
          { key: "critical", label: "🚨 今すぐ発注" },
          { key: "warning",  label: "⚠️ 要発注" },
          { key: "caution",  label: "⚡ 注意" },
          { key: "ok",       label: "✓ 正常" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: "14px 16px 12px",
              background: "none",
              border: "none",
              borderBottom: filter === tab.key ? "2px solid #e8622a" : "2px solid transparent",
              color: filter === tab.key ? "#111827" : "#9ca3af",
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: "13px",
              fontWeight: filter === tab.key ? "600" : "400",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Product List */}
      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {filtered.map((product) => {
          const level = calcAlertLevel(product);
          const alert = ALERT_CONFIG[level];
          const dos = calcDaysOfStock(product);
          const lead = calcLeadDays(product);
          const deadline = calcOrderDeadline(product);
          const totalStock = getStock(product.stock);
          const avgAmz = Math.round(avgSales(product.monthlySales.Amazon));
          const avgRak = Math.round(avgSales(product.monthlySales.楽天市場));
          const avgTotal = avgAmz + avgRak;
          const stockValue = totalStock * product.unitCost;

          return (
            <div
              key={product.id}
              style={{
                background: "#ffffff",
                border: `1px solid ${level === "critical" ? "#fecaca" : level === "warning" ? "#fed7aa" : "#e5e7eb"}`,
                borderLeft: `3px solid ${alert.bg}`,
                borderRadius: "12px",
                padding: "20px 24px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                {/* Left */}
                <div>
                  {/* Product header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "14px",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: product.color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "15px", fontWeight: "600", color: "#111827" }}>
                        {product.name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "3px",
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        {product.sku  && <span>SKU: <strong style={{ color: "#374151" }}>{product.sku}</strong></span>}
                        {product.asin && <span>ASIN: <strong style={{ color: "#374151" }}>{product.asin}</strong></span>}
                        {product.jan  && <span>JAN: <strong style={{ color: "#374151" }}>{product.jan}</strong></span>}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "4px 12px",
                        background: alert.bg + "18",
                        border: `1px solid ${alert.bg}44`,
                        borderRadius: "4px",
                        color: alert.bg,
                        fontSize: "12px",
                        fontWeight: "700",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {alert.icon} {alert.label}
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
                    <Metric
                      label="在庫日数"
                      value={dos === Infinity ? "∞" : dos}
                      unit="日"
                      accent={dos < lead ? "#dc2626" : dos < lead * 1.5 ? "#ea580c" : "#16a34a"}
                    />
                    <Metric
                      label="総在庫"
                      value={totalStock.toLocaleString()}
                      unit="個"
                      sub={`FBA ${product.stock.FBA.toLocaleString()} / 倉庫 ${product.stock.国内倉庫.toLocaleString()} / 楽天ロジ ${(product.stock.楽天ロジ || 0).toLocaleString()}`}
                    />
                    <Metric
                      label="3ヶ月平均"
                      value={avgTotal}
                      unit="個/月"
                      sub={`AMZ ${avgAmz} / 楽 ${avgRak}`}
                    />
                    <Metric
                      label="リードタイム"
                      value={lead}
                      unit="日"
                      sub={`製造 ${product.mfgLeadDays}日 + 輸送 ${product.shippingDays}日`}
                    />
                    <Metric
                      label="発注期限"
                      value={
                        avgTotal === 0 ? "—"
                          : deadline <= 0 ? "超過"
                          : `${deadline}日後`
                      }
                      unit=""
                      accent={
                        deadline !== null && deadline <= 0 ? "#dc2626"
                          : deadline !== null && deadline <= 14 ? "#ea580c"
                          : "#6b7280"
                      }
                    />
                  </div>

                  {/* Stock Value */}
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "8px 12px",
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>在庫合計金額</span>
                    <span style={{ fontWeight: "700", color: "#2563eb" }}>
                      ¥{stockValue.toLocaleString()}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: "11px" }}>
                      ({totalStock.toLocaleString()}個 × ¥{product.unitCost.toLocaleString()})
                    </span>
                  </div>

                  {/* Stock Bar */}
                  <div style={{ marginTop: "10px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        color: "#9ca3af",
                        marginBottom: "4px",
                      }}
                    >
                      <span>在庫水準</span>
                      <span>
                        安全在庫 {product.reorderPoint.toLocaleString()} / 発注ロット {product.orderQty.toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "#e5e7eb",
                        borderRadius: "3px",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, (totalStock / (product.orderQty * 1.2)) * 100)}%`,
                          background: `linear-gradient(90deg, ${
                            level === "critical" ? "#dc2626"
                              : level === "warning" ? "#ea580c"
                              : level === "caution" ? "#ca8a04"
                              : "#16a34a"
                          }, ${product.color}88)`,
                          borderRadius: "3px",
                          transition: "width 0.6s ease",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: `${(product.reorderPoint / (product.orderQty * 1.2)) * 100}%`,
                          width: "1px",
                          background: "#ea580c",
                        }}
                      />
                    </div>
                  </div>

                  {/* Order recommendation */}
                  {(level === "critical" || level === "warning") && (
                    <div
                      style={{
                        marginTop: "10px",
                        padding: "10px 14px",
                        background: "#fff7ed",
                        border: "1px solid #fed7aa",
                        borderRadius: "6px",
                        fontSize: "13px",
                        color: "#9a3412",
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <span>📦</span>
                      <span>
                        推奨発注数:{" "}
                        <strong style={{ color: "#b45309" }}>
                          {product.orderQty.toLocaleString()}個
                        </strong>{" "}
                        （発注金額: ¥{(product.orderQty * product.unitCost).toLocaleString()}）
                        　到着予定: {lead}日後
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <button
                    onClick={() => setEditProduct(product)}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      color: "#374151",
                      cursor: "pointer",
                      fontFamily: FONT,
                      fontSize: "13px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => deleteProduct(product.id)}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      color: "#9ca3af",
                      cursor: "pointer",
                      fontFamily: FONT,
                      fontSize: "13px",
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px", color: "#d1d5db", fontSize: "14px" }}>
            該当する製品はありません
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          padding: "14px 28px",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          gap: "20px",
          fontSize: "11px",
          color: "#9ca3af",
          flexWrap: "wrap",
          background: "#ffffff",
        }}
      >
        <span style={{ color: "#6b7280", fontWeight: "600" }}>アラート基準</span>
        <span>🚨 今すぐ発注 = 在庫日数 ≤ リードタイム</span>
        <span>⚠️ 要発注 = 在庫日数 ≤ リードタイム + 安全在庫日数</span>
        <span>⚡ 注意 = 上記の1.3倍以内</span>
        <span>* データはブラウザに保存されます</span>
      </div>

      {editProduct && (
        <ProductModal
          product={editProduct}
          onSave={saveProduct}
          onClose={() => setEditProduct(null)}
        />
      )}
    </div>
  );
}

function Metric({ label, value, unit, sub, accent }) {
  return (
    <div>
      <div style={{ fontSize: "11px", color: "#9ca3af", fontWeight: "500", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: "700", color: accent || "#111827" }}>
        {value}
        <span style={{ fontSize: "11px", fontWeight: "400", marginLeft: "2px", color: "#9ca3af" }}>
          {unit}
        </span>
      </div>
      {sub && (
        <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px", lineHeight: "1.5" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
