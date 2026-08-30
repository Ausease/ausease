import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import "./OperationsRunway.css";

type Lane = "now" | "next" | "held";
type ItemStatus = "open" | "done" | "held";
type NavKey = "runway" | "team" | "ask";

type RunwayItem = {
  id: number;
  lane: Lane;
  status: ItemStatus;
  title: string;
  detail: string;
  owner: string;
  initials: string;
  due: string;
  tone: "coral" | "ochre" | "teal" | "violet";
  icon: "alert" | "check" | "clipboard" | "file";
};

const initialItems: RunwayItem[] = [
  {
    id: 1,
    lane: "now",
    status: "open",
    title: "Cold room temperature check",
    detail: "Back of house · evidence photo required",
    owner: "Alex Carter",
    initials: "AC",
    due: "Due in 12 min",
    tone: "coral",
    icon: "alert",
  },
  {
    id: 2,
    lane: "now",
    status: "open",
    title: "Opening safety walk",
    detail: "Front of house · 6 checkpoints",
    owner: "Jordan Lee",
    initials: "JL",
    due: "Due at 09:30",
    tone: "ochre",
    icon: "clipboard",
  },
  {
    id: 3,
    lane: "next",
    status: "open",
    title: "Restock takeaway station",
    detail: "Front counter · 18 units remaining",
    owner: "Mia Santos",
    initials: "MS",
    due: "Due at 10:15",
    tone: "teal",
    icon: "check",
  },
  {
    id: 4,
    lane: "held",
    status: "held",
    title: "Replace leaking tap",
    detail: "Maintenance vendor · awaiting approval",
    owner: "Store lead",
    initials: "SL",
    due: "Held since yesterday",
    tone: "violet",
    icon: "file",
  },
];

const laneMeta: Record<Lane, { eyebrow: string; label: string; hint: string }> = {
  now: { eyebrow: "01", label: "Now", hint: "Needs a hand this shift" },
  next: { eyebrow: "02", label: "Next", hint: "Queued for the floor" },
  held: { eyebrow: "03", label: "Held", hint: "Waiting on someone else" },
};

function ItemIcon({ item }: { item: RunwayItem }) {
  const iconProps = { size: 16, strokeWidth: 2.1 };
  if (item.icon === "alert") return <AlertTriangle {...iconProps} />;
  if (item.icon === "clipboard") return <ClipboardCheck {...iconProps} />;
  if (item.icon === "file") return <FileText {...iconProps} />;
  return <CheckCircle2 {...iconProps} />;
}

function OperationsRunway() {
  const [activeNav, setActiveNav] = useState<NavKey>("runway");
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [showComposer, setShowComposer] = useState(false);
  const [message, setMessage] = useState("");
  const [askDraft, setAskDraft] = useState("");
  const [asked, setAsked] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const completedCount = items.filter((item) => item.status === "done").length;
  const openCount = items.filter((item) => item.status === "open").length;

  const toggleComplete = (id: number) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: item.status === "done" ? "open" : "done", lane: "next" }
          : item,
      ),
    );
  };

  const assignSelected = () => {
    if (!selectedItem) return;
    setItems((current) =>
      current.map((item) =>
        item.id === selectedItem.id
          ? { ...item, owner: "Alex Carter", initials: "AC", status: "open", lane: "now" }
          : item,
      ),
    );
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessage("");
    setShowComposer(false);
  };

  const askAusease = (prompt?: string) => {
    if (prompt) setAskDraft(prompt);
    setAsked(true);
  };

  return (
    <main className="runway-shell">
      <div className="runway-app">
        <header className="runway-header">
          <div className="brand-lockup">
            <div className="brand-mark"><Activity size={17} /></div>
            <div>
              <p className="brand-name">ausease</p>
              <p className="brand-context"><MapPin size={11} /> PITT STREET / SYDNEY</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="icon-button quiet" onClick={() => setActiveNav("team")} aria-label="Open notifications">
              <Bell size={17} />
              <span className="notification-dot" />
            </button>
            <button className="avatar-button" onClick={() => setActiveNav("ask")} aria-label="Open Alex profile">AC</button>
          </div>
        </header>

        <div className="day-strip">
          <div>
            <span className="date-kicker">TUESDAY · 25 AUGUST 2026</span>
            <h1>The floor, in one view.</h1>
          </div>
          <button className="shift-button" onClick={() => setActiveNav("runway")}>
            <span className="live-pip" /> Live
            <ArrowUpRight size={14} />
          </button>
        </div>

        {activeNav === "runway" && (
          <>
            <section className="shift-card">
              <div className="shift-card-top">
                <div>
                  <span className="card-label">MORNING SHIFT</span>
                  <p className="shift-time">08:00 — 16:30</p>
                </div>
                <div className="shift-score">
                  <span>{completedCount}/{items.length}</span>
                  <small>closed</small>
                </div>
              </div>
              <div className="progress-track"><span style={{ width: `${(completedCount / items.length) * 100}%` }} /></div>
              <div className="shift-footer">
                <span><Users size={13} /> 8 teammates on shift</span>
                <button onClick={() => setActiveNav("team")}>View team <ChevronRight size={13} /></button>
              </div>
            </section>

            <section className="pulse-row" aria-label="Store pulse">
              <div className="pulse-stat">
                <span className="pulse-icon coral"><Zap size={14} /></span>
                <strong>{openCount}</strong>
                <span>open now</span>
              </div>
              <div className="pulse-stat">
                <span className="pulse-icon ochre"><Clock3 size={14} /></span>
                <strong>12m</strong>
                <span>next due</span>
              </div>
              <div className="pulse-stat">
                <span className="pulse-icon teal"><ShieldCheck size={14} /></span>
                <strong>Good</strong>
                <span>store health</span>
              </div>
            </section>

            <section className="runway-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">ATTENTION QUEUE</span>
                  <h2>Runway</h2>
                </div>
                <button className="filter-button" onClick={() => setItems((current) => [...current].reverse())}>
                  <Search size={15} /> Sort
                </button>
              </div>
              <p className="section-intro">One clear next move, without the tab-hunt.</p>

              {(Object.keys(laneMeta) as Lane[]).map((lane) => {
                const laneItems = items.filter((item) => item.lane === lane);
                return (
                  <div className={`lane lane-${lane}`} key={lane}>
                    <div className="lane-heading">
                      <span className="lane-number">{laneMeta[lane].eyebrow}</span>
                      <div><h3>{laneMeta[lane].label}</h3><span>{laneMeta[lane].hint}</span></div>
                      <span className="lane-count">{laneItems.length}</span>
                    </div>
                    {laneItems.length === 0 ? (
                      <div className="empty-lane"><Check size={14} /> Nothing waiting here</div>
                    ) : (
                      laneItems.map((item) => (
                        <button
                          className={`queue-card ${selectedId === item.id ? "selected" : ""} ${item.status === "done" ? "completed" : ""}`}
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <span className={`queue-icon ${item.tone}`}><ItemIcon item={item} /></span>
                          <span className="queue-copy">
                            <strong>{item.title}</strong>
                            <span>{item.detail}</span>
                            <small><span className="mini-avatar">{item.initials}</span>{item.owner} <i /> {item.due}</small>
                          </span>
                          <ChevronRight className="queue-chevron" size={16} />
                        </button>
                      ))
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}

        {activeNav === "team" && (
          <section className="secondary-view">
            <div className="section-heading">
              <div><span className="section-kicker">PITT STREET TEAM</span><h2>People on the floor</h2></div>
              <button className="filter-button" onClick={() => setShowComposer(true)}><Plus size={15} /> Note</button>
            </div>
            <div className="team-presence"><span className="live-pip" /> 8 people online <span className="presence-divider" /> 2 away</div>
            <div className="team-list">
              {[
                ["AC", "Alex Carter", "Store lead", "Leading shift", "coral"],
                ["JL", "Jordan Lee", "Barista", "Opening safety walk", "ochre"],
                ["MS", "Mia Santos", "Barista", "Restocking counter", "teal"],
                ["RK", "Riley Kim", "Kitchen", "On break · back at 09:40", "violet"],
              ].map(([initials, name, role, task, tone]) => (
                <button className="person-row" key={name} onClick={() => setMessage(`Hey ${name.split(" ")[0]}, `)}>
                  <span className={`person-avatar ${tone}`}>{initials}</span>
                  <span className="person-copy"><strong>{name}</strong><span>{role}</span></span>
                  <span className="person-task">{task}</span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
            <div className="team-note">
              <div className="note-icon"><MessageCircle size={16} /></div>
              <div><span className="section-kicker">TEAM NOTE · 08:42</span><p>“Supplier delivery moved to 11:15. I’ll receive it from the back door.”</p><small>— Jordan Lee</small></div>
            </div>
          </section>
        )}

        {activeNav === "ask" && (
          <section className="secondary-view ask-view">
            <div className="ask-hero">
              <div className="ask-orb"><Sparkles size={22} /></div>
              <span className="section-kicker">AUSEASE ASSISTANT</span>
              <h2>Ask for the next move.</h2>
              <p>Context from your shift, your store, and the work already in motion.</p>
            </div>
            {asked && (
              <div className="answer-card">
                <span className="answer-label"><Sparkles size={13} /> AUSEASE</span>
                <p>{askDraft || "I found 2 things that need attention before open: the cold room check and the safety walk. Jordan owns the walk; the cold room is still yours."}</p>
                <button onClick={() => setActiveNav("runway")}>Open runway <ArrowUpRight size={14} /></button>
              </div>
            )}
            <div className="prompt-grid">
              <button onClick={() => askAusease("What still needs doing?")}><Clock3 size={15} /> What still needs doing?</button>
              <button onClick={() => askAusease("Summarise the open issues")}><AlertTriangle size={15} /> Summarise open issues</button>
              <button onClick={() => askAusease("Assign the safety walk")}><ClipboardCheck size={15} /> Assign a checklist</button>
              <button onClick={() => askAusease("Find the close SOP")}><FileText size={15} /> Find a playbook</button>
            </div>
            <div className="ask-composer">
              <input value={askDraft} onChange={(event) => setAskDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") askAusease(); }} placeholder="Ask Ausease anything..." />
              <button onClick={() => askAusease()} aria-label="Send question"><Send size={16} /></button>
            </div>
          </section>
        )}

        {selectedItem && activeNav === "runway" && (
          <div className="detail-sheet">
            <button className="sheet-dismiss" onClick={() => setSelectedId(null)} aria-label="Close task details"><X size={17} /></button>
            <div className={`sheet-mark ${selectedItem.tone}`}><ItemIcon item={selectedItem} /></div>
            <div className="sheet-copy">
              <span className="section-kicker">{selectedItem.lane === "held" ? "WAITING ON APPROVAL" : "ACTION ITEM"}</span>
              <h3>{selectedItem.title}</h3>
              <p>{selectedItem.detail}</p>
              <span className="sheet-meta"><UserRound size={13} /> {selectedItem.owner} <i /> {selectedItem.due}</span>
            </div>
            <div className="sheet-actions">
              <button className="primary-action" onClick={() => toggleComplete(selectedItem.id)}><Check size={15} /> {selectedItem.status === "done" ? "Reopen item" : "Mark complete"}</button>
              <button className="secondary-action" onClick={assignSelected}><Users size={15} /> Assign to me</button>
            </div>
          </div>
        )}

        <nav className="bottom-nav" aria-label="Primary navigation">
          <button className={activeNav === "runway" ? "active" : ""} onClick={() => setActiveNav("runway")}><LayoutGrid size={18} /><span>Runway</span></button>
          <button className={activeNav === "team" ? "active" : ""} onClick={() => setActiveNav("team")}><MessageCircle size={18} /><span>Team</span><b>2</b></button>
          <button className={activeNav === "ask" ? "active" : ""} onClick={() => setActiveNav("ask")}><Sparkles size={18} /><span>Ask</span></button>
          <button onClick={() => setShowComposer(true)}><Plus size={18} /><span>Capture</span></button>
        </nav>

        {showComposer && (
          <div className="compose-overlay" role="dialog" aria-modal="true">
            <div className="compose-panel">
              <div className="compose-head"><div><span className="section-kicker">CAPTURE A MOMENT</span><h3>Leave a note for the floor</h3></div><button onClick={() => setShowComposer(false)} aria-label="Close note"><X size={18} /></button></div>
              <textarea autoFocus value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What should the team know?" />
              <div className="compose-tools"><button onClick={() => setMessage((current) => `${current} [photo attached]`)}><Paperclip size={15} /> Attach</button><button onClick={() => setMessage((current) => `${current} [voice note]`)}><Mic size={15} /> Voice note</button><button className="primary-action" onClick={sendMessage}><Send size={15} /> Post note</button></div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default OperationsRunway;