/**
 * VidClips - Editor Page
 * Main editor layout with collapsible, animated workspace panels.
 */
import { useState } from "react";
import { useEditor } from "../context/EditorContext";
import { useAnalysisData } from "../hooks/useAnalysisData";
import TopBar from "../components/layout/TopBar";
import Sidebar from "../components/layout/Sidebar";
import VideoPlayer from "../components/player/VideoPlayer";
import Inspector from "../components/inspector/Inspector";
import Timeline from "../components/timeline/Timeline";
import StatusBar from "../components/layout/StatusBar";
import ToastContainer from "../components/ui/Toast";
import {
  FolderOpen, Clapperboard, Box, ScanFace, Palette, Music,
  Camera, Type, Settings, PanelLeftClose, PanelRightClose,
  PanelLeftOpen, PanelRightOpen, Sparkles,
} from "lucide-react";

function WorkspacePanel({ tab }) {
  const panels = {
    project: { icon: FolderOpen, title: "Project", description: "Manage your video project and imported media." },
    scenes: { icon: Clapperboard, title: "Scenes", description: "Browse detected scenes and jump directly to any scene." },
    objects: { icon: Box, title: "Objects", description: "View objects detected by AI analysis." },
    faces: { icon: ScanFace, title: "Faces", description: "View detected faces and facial tracking information." },
    colors: { icon: Palette, title: "Colors", description: "Explore color analysis and visual characteristics." },
    audio: { icon: Music, title: "Audio", description: "Explore audio and speech analysis." },
    motion: { icon: Camera, title: "Motion", description: "View camera movement and motion analysis." },
    ocr: { icon: Type, title: "OCR Text", description: "View text detected inside the video." },
    settings: { icon: Settings, title: "Settings", description: "Configure VidClips editor settings." },
  };
  const panel = panels[tab] || panels.project;
  const Icon = panel.icon;

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-[#0a0e18]">
      <div className="h-12 shrink-0 border-b border-white/[0.07] bg-[#0e1421] flex items-center px-5 gap-2">
        <Icon size={16} className="text-sky-400" />
        <h2 className="text-sm font-semibold text-zinc-200">{panel.title}</h2>
        <span className="ml-auto text-[10px] uppercase tracking-[.18em] text-zinc-600">Workspace</span>
      </div>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-4xl rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#111a2a] to-[#0e1420] p-7 shadow-2xl shadow-black/10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-400/10 border border-sky-300/15 flex items-center justify-center shrink-0">
              <Icon size={22} className="text-sky-300" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">{panel.title}</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{panel.description}</p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-zinc-500">
                <Sparkles size={14} className="text-sky-400" />
                Upload a video and run analysis to populate this workspace.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Editor() {
  useAnalysisData();
  const { activeSidebarTab } = useEditor();
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showInspector, setShowInspector] = useState(true);

  return (
    <div className="vidclips-editor h-screen w-screen overflow-hidden bg-[#090d15] flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className={`sidebar-slide shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${showLeftSidebar ? "w-56 opacity-100" : "w-0 opacity-0"}`}>
          <Sidebar />
        </div>

        {activeSidebarTab === "project" ? (
          <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#0a0e18]">
            <div className="h-10 shrink-0 flex items-center gap-1 px-3 border-b border-white/[0.06] bg-[#0d1320]">
              <button
                type="button"
                onClick={() => setShowLeftSidebar((value) => !value)}
                title={showLeftSidebar ? "Hide workspace sidebar" : "Show workspace sidebar"}
                aria-label={showLeftSidebar ? "Hide workspace sidebar" : "Show workspace sidebar"}
                className="panel-toggle"
              >
                {showLeftSidebar ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>
              <span className="mx-1 h-4 w-px bg-white/10" />
              <span className="text-[11px] text-zinc-500">{activeSidebarTab === "project" ? "Editor" : activeSidebarTab}</span>
              <div className="ml-auto flex items-center gap-1">
                <span className="mr-2 text-[10px] uppercase tracking-widest text-zinc-600">Panels</span>
                <button
                  type="button"
                  onClick={() => setShowInspector((value) => !value)}
                  title={showInspector ? "Hide inspector" : "Show inspector"}
                  aria-label={showInspector ? "Hide inspector" : "Show inspector"}
                  className="panel-toggle"
                >
                  {showInspector ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                  <span className="hidden sm:inline text-[11px]">{showInspector ? "Hide inspector" : "Show inspector"}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex">
              <div className="flex-1 min-w-0 min-h-0">
                <VideoPlayer />
              </div>
              <div className={`inspector-slide shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${showInspector ? "w-80 opacity-100" : "w-0 opacity-0"}`}>
                <Inspector />
              </div>
            </div>
            <Timeline />
          </main>
        ) : (
          <WorkspacePanel tab={activeSidebarTab} />
        )}
      </div>
      <StatusBar />
      <ToastContainer />
    </div>
  );
}
