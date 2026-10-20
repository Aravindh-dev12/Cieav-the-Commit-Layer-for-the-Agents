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
