#include <windows.h>
#include <tbs.h>
#include <cstdint>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef _MSC_VER
#pragma comment(lib,"tbs.lib")
#endif

namespace {
constexpr char kProtocol[]="CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1";
constexpr std::uint32_t kMaxLogBytes=8u*1024u*1024u;

std::string jsonEscape(const std::string& s){std::ostringstream o;for(unsigned char c:s){switch(c){case '"':o<<"\\\"";break;case '\\':o<<"\\\\";break;case '\n':o<<"\\n";break;case '\r':o<<"\\r";break;case '\t':o<<"\\t";break;default:if(c<0x20){o<<"\\u";static constexpr char h[]="0123456789abcdef";o<<"00"<<h[(c>>4)&15]<<h[c&15];}else{o<<static_cast<char>(c);}}}return o.str();}
std::string b64url(const unsigned char* data,std::size_t n){static constexpr char table[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";std::string out;out.reserve((n*4+2)/3);for(std::size_t i=0;i<n;i+=3){unsigned v=static_cast<unsigned>(data[i])<<16;if(i+1<n)v|=static_cast<unsigned>(data[i+1])<<8;if(i+2<n)v|=static_cast<unsigned>(data[i+2]);out.push_back(table[(v>>18)&63]);out.push_back(table[(v>>12)&63]);if(i+1<n)out.push_back(table[(v>>6)&63]);if(i+2<n)out.push_back(table[v&63]);}return out;}
std::string hexStatus(TBS_RESULT value){std::ostringstream o;o<<"0x"<<std::hex<<std::uppercase<<static_cast<unsigned long>(value);return o.str();}

struct LogType{UINT32 value;const char* name;const char* session;};
LogType parseLogType(const std::string& raw){
  if(raw=="srtm-current")return{TBS_TCGLOG_SRTM_CURRENT,"SRTM_CURRENT","current-session"};
  if(raw=="srtm-boot")return{TBS_TCGLOG_SRTM_BOOT,"SRTM_BOOT","most-recent-clean-boot"};
  if(raw=="srtm-resume")return{TBS_TCGLOG_SRTM_RESUME,"SRTM_RESUME","most-recent-hibernation-resume"};
  throw std::runtime_error("unsupported log type; expected srtm-current, srtm-boot, or srtm-resume");
}
std::string argValue(int argc,char** argv,const std::string& name){for(int i=2;i+1<argc;++i)if(argv[i]==name)return argv[i+1];throw std::runtime_error("missing required argument: "+name);}

std::vector<unsigned char> collectLog(UINT32 type){
  UINT32 required=0;const TBS_RESULT estimate=Tbsi_Get_TCG_Log_Ex(type,nullptr,&required);
  if(required==0){throw std::runtime_error("Tbsi_Get_TCG_Log_Ex(size) failed: "+hexStatus(estimate));}
  if(required>kMaxLogBytes)throw std::runtime_error("TCG log exceeds CIEAV 8 MiB evidence cap");
  std::vector<unsigned char> log(required);UINT32 actual=required;const TBS_RESULT result=Tbsi_Get_TCG_Log_Ex(type,log.data(),&actual);
  if(result!=TBS_SUCCESS)throw std::runtime_error("Tbsi_Get_TCG_Log_Ex failed: "+hexStatus(result));
  if(actual==0||actual>required||actual>kMaxLogBytes)throw std::runtime_error("Tbsi_Get_TCG_Log_Ex returned invalid log length");
  log.resize(actual);return log;
}

int probe(){
  try{auto log=collectLog(TBS_TCGLOG_SRTM_CURRENT);std::cout<<"{\"protocol\":\""<<kProtocol<<"\",\"operation\":\"probe\",\"collector\":\"Windows TBS\",\"available\":true,\"logType\":\"SRTM_CURRENT\",\"pcrRange\":\"0-15\",\"bytes\":"<<log.size()<<",\"qualification\":\"UNQUALIFIED\"}\n";return 0;}
  catch(const std::exception& e){std::cout<<"{\"protocol\":\""<<kProtocol<<"\",\"operation\":\"probe\",\"collector\":\"Windows TBS\",\"available\":false,\"qualification\":\"UNQUALIFIED\",\"reason\":\""<<jsonEscape(e.what())<<"\"}\n";return 20;}
}
int collect(int argc,char** argv){auto type=parseLogType(argValue(argc,argv,"--type"));auto log=collectLog(type.value);std::cout<<"{\"protocol\":\""<<kProtocol<<"\",\"operation\":\"collect-log\",\"collector\":\"Windows TBS\",\"logType\":\""<<type.name<<"\",\"session\":\""<<type.session<<"\",\"pcrRange\":\"0-15\",\"bytes\":"<<log.size()<<",\"qualification\":\"UNQUALIFIED\",\"log\":\""<<b64url(log.data(),log.size())<<"\"}\n";return 0;}
}

int main(int argc,char** argv){try{if(argc<2){std::cerr<<"usage: cieav-windows-tpm-measured-boot <probe|collect-log> [--type srtm-current|srtm-boot|srtm-resume]\n";return 2;}std::string cmd=argv[1];if(cmd=="probe")return probe();if(cmd=="collect-log")return collect(argc,argv);std::cerr<<"unsupported command\n";return 2;}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 20;}}
