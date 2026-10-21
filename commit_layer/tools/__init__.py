from commit_layer.tools.base import BaseTool, TOOL_REGISTRY
from commit_layer.tools.payments import SendPaymentTool, FlakyPaymentTool
from commit_layer.tools.files import DeleteFileTool
from commit_layer.tools.access import GrantAccessTool
from commit_layer.tools.email import SendEmailTool
from commit_layer.tools.software import RunTerminalCommandTool, DeployServiceTool, ModifyCodeFileTool
from commit_layer.tools.hardware import TpmSignAttestationTool, PowerCycleDeviceTool
from commit_layer.tools.headroom import HeadroomCompressTool, HeadroomRetrieveTool, HeadroomStatsTool
from commit_layer.tools.repo import RealRepoFileTool
from commit_layer.tools.jobs import JobApplicationTool
from commit_layer.tools.windows_recycle_bin import InspectRecycleBinTool, EmptyRecycleBinTool
from commit_layer.tools.notes_manager import NotesManager, notes_manager, NotesManagerTool
from commit_layer.tools.github_agent import GitHubDevOpsAgent, github_agent, GitHubDevOpsTool
from commit_layer.tools.email_agent import EmailAgent, email_agent, EmailAgentTool
from commit_layer.tools.messaging_agent import WhatsAppMessagingAgent, whatsapp_agent, WhatsAppMessagingTool

try:
    from commit_layer.rea import REABilateralExchangeTool
except (ImportError, AttributeError):
    REABilateralExchangeTool = None
from commit_layer.tools.app_launcher import AppLauncherTool, CloseApplicationTool, app_launcher, AppLauncherManager
from commit_layer.tools.gmail_agent import GmailApplicationInspectorTool, GmailApplicationInspector, gmail_agent
from commit_layer.tools.browser_interactive_tool import BrowserInteractiveTool
from commit_layer.tools.app_runner_tool import RunDesktopAppTool, RunEntireAppTool
from commit_layer.tools.app_runner import UniversalAppRunner, app_runner
from commit_layer.interactive_browser import UniversalInteractiveBrowserAgent, interactive_browser
from commit_layer.tools.sandbox_tool import SandboxExecuteTool, MemoryHiveTool
from commit_layer.sandbox_controller import central_sandbox, CentralSandboxController
from commit_layer.memory_hive import memory_hive, PersistentMemoryHive
from commit_layer.tools.intentional_tools import IntentionalExecuteTool, PlaybookReplayTool
from commit_layer.intentional_orchestrator import intentional_orchestrator, IntentionalOrchestrator
from commit_layer.procedural_playbooks import playbook_manager, ProceduralPlaybookManager
from commit_layer.intentional_gai import hybrid_gai, HybridGAI
