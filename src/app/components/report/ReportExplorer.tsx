import { useState } from "react";
import { ArrowUpRight, Search, Globe, SearchCheck, Church } from "lucide-react";
import type { SeasonalReport } from "../church-data";
import type { ReportSection, SectionId } from "./useReportScrollspy";
import { reportUnitNoun } from "./report-scope";

export function ReportNavigator({sections, active, onNavigate}: { sections: readonly ReportSection[]; active: SectionId; onNavigate: (id:SectionId)=>void }) {
  const [query,setQuery] = useState("");
  const filtered = sections.filter(section=>section.label.toLowerCase().includes(query.toLowerCase()));
  return <nav className="report-navigator" aria-label="Report contents">
    <p className="text-sm font-medium text-stone-900 mb-3">Inside this report</p>
    <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 mb-4"><Search size={13} className="text-stone-400 shrink-0"/><input aria-label="Find a report section" placeholder="Find a topic…" value={query} onChange={e=>setQuery(e.target.value)} className="text-xs bg-transparent min-w-0 w-full outline-none"/></label>
    <div className="space-y-1">{filtered.map((section)=><button key={section.id} onClick={()=>onNavigate(section.id)} aria-current={active===section.id ? "location" : undefined} className={active===section.id ? "active" : ""}><span className="report-nav-dot"/>{section.label}</button>)}</div>
    {!filtered.length && <p className="text-xs text-stone-500">No matching topic.</p>}
    <a href="/reports" className="mt-6 inline-flex items-center gap-2 text-xs text-purple-700">Find another report <ArrowUpRight size={12}/></a>
  </nav>;
}

export function ReportOverview({report, onNavigate}: {report:SeasonalReport; onNavigate:(id:SectionId)=>void}) {
  const complete = Math.max(0,Math.min(100,100-report.dataQuality.pctNeedsReview));
  const denominations = [...report.denominations.national].sort((a,b)=>b.pct-a.pct).slice(0,3);
  const coveredPlaces = report.scope === "state" ? Object.keys(report.geoDensity.countyMetrics ?? {}).length : report.bigPicture.statesPopulated;
  const unit = reportUnitNoun(report);
  const colors = ["#7c3aed","#a78bfa","#d8b4fe"];
  return <section className="report-overview" aria-labelledby="snapshot-overview">
    <div className="flex items-end justify-between gap-4 mb-4"><div><h2 id="snapshot-overview" className="text-xl font-medium tracking-tight">Your report, at a glance.</h2><p className="text-sm text-stone-500 mt-1">Pick a perspective to explore the details.</p></div></div>
    <div className="report-overview-grid">
      <button onClick={()=>onNavigate("geo-density")} className="report-overview-card">
        <span className="report-overview-label"><Globe size={15}/>The places <ArrowUpRight size={13}/></span>
        <div className="report-geography-art" aria-hidden><Globe size={82} strokeWidth={.65}/><span/><span/><span/></div>
        <strong className="text-3xl font-medium tracking-tight">{report.bigPicture.totalChurches.toLocaleString()}</strong>
        <span className="text-xs text-stone-500">mapped churches{coveredPlaces > 0 ? ` · ${coveredPlaces} ${coveredPlaces === 1 ? unit.one : unit.many}` : ""}</span>
      </button>
      <button onClick={()=>onNavigate("denominations")} className="report-overview-card">
        <span className="report-overview-label"><Church size={15}/>The traditions <ArrowUpRight size={13}/></span>
        <div className="flex h-3 overflow-hidden rounded-full bg-stone-100 mt-7 mb-5" aria-hidden>{denominations.map((item,i)=><span key={item.name} style={{width:item.pct+"%",background:colors[i]}}/>)}</div>
        <div className="space-y-3">{denominations.map((item,i)=><div key={item.name} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full shrink-0" style={{background:colors[i]}}/><span className="truncate">{item.name}</span><span className="ml-auto text-stone-500 tabular-nums">{item.pct}%</span></div>)}</div>
        {!denominations.length && <p className="text-xs text-stone-500">No denomination breakdown in this snapshot.</p>}
      </button>
      <button onClick={()=>onNavigate("data-quality")} className="report-overview-card">
        <span className="report-overview-label"><SearchCheck size={15}/>The data <ArrowUpRight size={13}/></span>
        <div className="report-quality-ring" style={{background:`conic-gradient(#8b5cf6 ${complete}%, #ede9f5 0)`}}><span><strong>{Number(complete.toFixed(1))}%</strong><small>core info</small></span></div>
        <span className="text-xs text-stone-500">Name, address & a contact method</span>
      </button>
    </div>
  </section>;
}


export function ReportCoverageGrid({title,items}: {title:string; items:{label:string; value?:number}[]}) {
  const available = items.filter((item): item is {label:string;value:number} => item.value != null);
  if (!available.length) return null;
  return <div className="mt-7">
    <h3 className="text-sm font-medium text-stone-900 mb-3">{title}</h3>
    <div className="report-coverage-grid">{available.map(item=><div key={item.label} className="report-coverage-card">
      <span className="text-xs text-stone-500">{item.label}</span>
      <strong className="block mt-3 text-2xl font-medium tracking-tight tabular-nums text-purple-950">{item.value}%</strong>
      <div className="mt-3 h-1.5 rounded-full bg-purple-50 overflow-hidden" aria-hidden><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-300" style={{width:Math.max(0,Math.min(100,item.value))+"%"}}/></div>
    </div>)}</div>
  </div>;
}
