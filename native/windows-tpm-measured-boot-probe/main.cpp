#include <windows.h>
#include <ncrypt.h>
#include <bcrypt.h>
#include <tbs.h>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#pragma comment(lib,"ncrypt.lib")
#pragma comment(lib,"bcrypt.lib")
#pragma comment(lib,"tbs.lib")

namespace {
struct NcryptHandle{NCRYPT_HANDLE h{0};explicit NcryptHandle(NCRYPT_HANDLE v=0):h(v){}~NcryptHandle(){if(h)NCryptFreeObject(h);}NcryptHandle(const NcryptHandle&)=delete;NcryptHandle& operator=(const NcryptHandle&)=delete;};

std::string hexStatus(SECURITY_STATUS value){std::ostringstream o;o<<"0x"<<std::hex<<std::uppercase<<std::setw(8)<<std::setfill('0')<<static_cast<unsigned long>(value);return o.str();}
std::string hexTbs(TBS_RESULT value){std::ostringstream o;o<<"0x"<<std::hex<<std::uppercase<<std::setw(8)<<std::setfill('0')<<static_cast<unsigned long>(value);return o.str();}
std::wstring widen(const std::string& in){if(in.empty())throw std::runtime_error("empty UTF-8 value");int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,in.data(),static_cast<int>(in.size()),nullptr,0);if(n<=0)throw std::runtime_error("invalid UTF-8");std::wstring out(static_cast<size_t>(n),L'\0');if(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,in.data(),static_cast<int>(in.size()),out.data(),n)<=0)throw std::runtime_error("invalid UTF-8");return out;}
std::string argValue(int argc,char** argv,const std::string& name){for(int i=2;i+1<argc;++i)if(argv[i]==name)return argv[i+1];throw std::runtime_error("missing required argument: "+name);}
bool hasFlag(int argc,char** argv,const std::string& name){for(int i=2;i<argc;++i)if(argv[i]==name)return true;return false;}

NCRYPT_PROV_HANDLE openPlatformProvider(){NCRYPT_PROV_HANDLE p=0;SECURITY_STATUS s=NCryptOpenStorageProvider(&p,MS_PLATFORM_CRYPTO_PROVIDER,0);if(s!=ERROR_SUCCESS)throw std::runtime_error("NCryptOpenStorageProvider failed: "+hexStatus(s));DWORD impl=0,cb=0;s=NCryptGetProperty(p,NCRYPT_IMPL_TYPE_PROPERTY,reinterpret_cast<PBYTE>(&impl),sizeof(impl),&cb,0);if(s!=ERROR_SUCCESS){NCryptFreeObject(p);throw std::runtime_error("NCryptGetProperty(Impl Type) failed: "+hexStatus(s));}if((impl&NCRYPT_IMPL_HARDWARE_FLAG)==0||(impl&NCRYPT_IMPL_SOFTWARE_FLAG)!=0){NCryptFreeObject(p);throw std::runtime_error("Platform Crypto Provider is not exclusive hardware");}return p;}
NCRYPT_KEY_HANDLE openAik(NCRYPT_PROV_HANDLE provider,const std::string& name,bool machine){NCRYPT_KEY_HANDLE key=0;DWORD flags=NCRYPT_SILENT_FLAG|(machine?NCRYPT_MACHINE_KEY_FLAG:0);SECURITY_STATUS s=NCryptOpenKey(provider,&key,widen(name).c_str(),0,flags);if(s!=ERROR_SUCCESS)throw std::runtime_error("NCryptOpenKey(AIK) failed: "+hexStatus(s));return key;}
void freeVerifyOutput(NCryptBufferDesc& output){if(!output.pBuffers)return;for(ULONG i=0;i<output.cBuffers;++i)if(output.pBuffers[i].pvBuffer)NCryptFreeBuffer(output.pBuffers[i].pvBuffer);NCryptFreeBuffer(output.pBuffers);output.pBuffers=nullptr;output.cBuffers=0;}

struct ClaimAttempt{const char* name;NCRYPT_KEY_HANDLE subject;NCRYPT_KEY_HANDLE authority;};
struct ClaimResult{std::string name;SECURITY_STATUS status;SECURITY_STATUS createStatus;SECURITY_STATUS verifyStatus;DWORD requiredBytes;DWORD claimBytes;};

ClaimResult tryPlatformClaim(const ClaimAttempt& attempt,std::vector<unsigned char>& nonce){
  DWORD pcrMask=0x0000FFFF;
  NCryptBuffer buffers[2]{};
  buffers[0].cbBuffer=sizeof(pcrMask);buffers[0].BufferType=NCRYPTBUFFER_TPM_PLATFORM_CLAIM_PCR_MASK;buffers[0].pvBuffer=&pcrMask;
  buffers[1].cbBuffer=static_cast<ULONG>(nonce.size());buffers[1].BufferType=NCRYPTBUFFER_TPM_PLATFORM_CLAIM_NONCE;buffers[1].pvBuffer=nonce.data();
  NCryptBufferDesc desc{};desc.ulVersion=NCRYPTBUFFER_VERSION;desc.cBuffers=2;desc.pBuffers=buffers;
  DWORD required=0;
  const SECURITY_STATUS sizeStatus=NCryptCreateClaim(attempt.subject,attempt.authority,NCRYPT_CLAIM_PLATFORM,&desc,nullptr,0,&required,0);
  if(sizeStatus!=ERROR_SUCCESS||required==0||required>1024u*1024u)return ClaimResult{attempt.name,sizeStatus,sizeStatus,static_cast<SECURITY_STATUS>(NTE_BAD_DATA),required,0};
  std::vector<unsigned char> claim(required);DWORD actual=required;
  const SECURITY_STATUS createStatus=NCryptCreateClaim(attempt.subject,attempt.authority,NCRYPT_CLAIM_PLATFORM,&desc,claim.data(),static_cast<DWORD>(claim.size()),&actual,0);
  if(createStatus!=ERROR_SUCCESS||actual==0||actual>claim.size())return ClaimResult{attempt.name,sizeStatus,createStatus,static_cast<SECURITY_STATUS>(NTE_BAD_DATA),required,actual};
  claim.resize(actual);NCryptBufferDesc output{};
  const SECURITY_STATUS verifyStatus=NCryptVerifyClaim(attempt.subject,attempt.authority,NCRYPT_CLAIM_PLATFORM,&desc,claim.data(),static_cast<DWORD>(claim.size()),&output,0);
  freeVerifyOutput(output);
  return ClaimResult{attempt.name,sizeStatus,createStatus,verifyStatus,required,actual};
}

struct LogProbe{TBS_RESULT status;UINT32 requiredBytes;};
LogProbe probeLog(UINT32 type){UINT32 bytes=0;TBS_RESULT status=Tbsi_Get_TCG_Log_Ex(type,nullptr,&bytes);return LogProbe{status,bytes};}

int run(int argc,char** argv){
  const std::string aikName=argValue(argc,argv,"--aik");
  const bool machine=!hasFlag(argc,argv,"--aik-user");
  NcryptHandle provider(openPlatformProvider()),aik(openAik(static_cast<NCRYPT_PROV_HANDLE>(provider.h),aikName,machine));
  std::vector<unsigned char> nonce(32);if(BCryptGenRandom(nullptr,nonce.data(),static_cast<ULONG>(nonce.size()),BCRYPT_USE_SYSTEM_PREFERRED_RNG)<0)throw std::runtime_error("BCryptGenRandom failed");

  const ClaimAttempt attempts[]={
    {"subject-null_authority-aik",0,static_cast<NCRYPT_KEY_HANDLE>(aik.h)},
    {"subject-aik_authority-null",static_cast<NCRYPT_KEY_HANDLE>(aik.h),0},
    {"subject-aik_authority-aik",static_cast<NCRYPT_KEY_HANDLE>(aik.h),static_cast<NCRYPT_KEY_HANDLE>(aik.h)}
  };
  const auto currentLog=probeLog(TBS_TCGLOG_SRTM_CURRENT),bootLog=probeLog(TBS_TCGLOG_SRTM_BOOT);

  std::cout<<"{\"protocol\":\"CIEAV_WINDOWS_TPM_MEASURED_BOOT_PROBE_V1\",\"operation\":\"probe\",\"hardwareBacked\":true,\"aikName\":\""<<aikName<<"\",\"aikMachineKey\":"<<(machine?"true":"false")<<",\"pcrMask\":65535,\"nonceBytes\":32,\"qualification\":\"UNQUALIFIED\",\"logs\":{\"srtmCurrent\":{\"status\":\""<<hexTbs(currentLog.status)<<"\",\"requiredBytes\":"<<currentLog.requiredBytes<<"},\"srtmBoot\":{\"status\":\""<<hexTbs(bootLog.status)<<"\",\"requiredBytes\":"<<bootLog.requiredBytes<<"}},\"claimAttempts\":[";
  for(size_t i=0;i<std::size(attempts);++i){auto result=tryPlatformClaim(attempts[i],nonce);if(i)std::cout<<",";std::cout<<"{\"name\":\""<<result.name<<"\",\"status\":\""<<hexStatus(result.status)<<"\",\"requiredBytes\":"<<result.requiredBytes<<",\"createStatus\":\""<<hexStatus(result.createStatus)<<"\",\"claimBytes\":"<<result.claimBytes<<",\"verifyStatus\":\""<<hexStatus(result.verifyStatus)<<"\",\"verified\":"<<(result.verifyStatus==ERROR_SUCCESS?"true":"false")<<"}";}
  std::cout<<"]}\n";
  return 0;
}
}

int main(int argc,char** argv){try{if(argc<2||std::string(argv[1])!="probe"){std::cerr<<"usage: cieav-windows-tpm-measured-boot-probe probe --aik <name> [--aik-user]\n";return 2;}return run(argc,argv);}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 20;}}
