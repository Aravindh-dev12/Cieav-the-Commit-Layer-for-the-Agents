#include <windows.h>
#include <ncrypt.h>
#include <string>
#include <vector>
#include <iostream>
#include <stdexcept>
#include <cstdlib>
#include <memory>

#include <azure/core.hpp>
#include <azure/attestation.hpp>
#include <azure/identity.hpp>
#include <att_manager.h>
#include <att_manager_logger.h>

#pragma comment(lib,"ncrypt.lib")

namespace {
struct NcryptHandle{NCRYPT_HANDLE h{0};explicit NcryptHandle(NCRYPT_HANDLE v=0):h(v){}~NcryptHandle(){if(h)NCryptFreeObject(h);}NcryptHandle(const NcryptHandle&)=delete;NcryptHandle& operator=(const NcryptHandle&)=delete;};

std::string requiredEnv(const char* name){const char* value=std::getenv(name);if(!value||!*value)throw std::runtime_error(std::string("missing required environment: ")+name);return value;}
std::wstring widen(const std::string& in){if(in.empty())throw std::runtime_error("empty UTF-8 value");int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,in.data(),static_cast<int>(in.size()),nullptr,0);if(n<=0)throw std::runtime_error("invalid UTF-8");std::wstring out(static_cast<size_t>(n),L'\0');if(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,in.data(),static_cast<int>(in.size()),out.data(),n)<=0)throw std::runtime_error("invalid UTF-8");return out;}
void checkNcrypt(const char* op,SECURITY_STATUS s){if(s!=ERROR_SUCCESS)throw std::runtime_error(std::string(op)+" failed");}
void checkAtt(const char* op,att_result r){if(att_result_failed(r))throw std::runtime_error(std::string(op)+" failed");}

NCRYPT_PROV_HANDLE openPlatformProvider(){NCRYPT_PROV_HANDLE p=0;checkNcrypt("NCryptOpenStorageProvider",NCryptOpenStorageProvider(&p,MS_PLATFORM_CRYPTO_PROVIDER,0));DWORD impl=0,cb=0;checkNcrypt("NCryptGetProperty",NCryptGetProperty(p,NCRYPT_IMPL_TYPE_PROPERTY,reinterpret_cast<PBYTE>(&impl),sizeof(impl),&cb,0));if((impl&NCRYPT_IMPL_HARDWARE_FLAG)==0||(impl&NCRYPT_IMPL_SOFTWARE_FLAG)!=0){NCryptFreeObject(p);throw std::runtime_error("Platform Crypto Provider hardware invariant failed");}return p;}
NCRYPT_KEY_HANDLE openNamedKey(NCRYPT_PROV_HANDLE provider,const std::string& name,DWORD flags){NCRYPT_KEY_HANDLE key=0;auto w=widen(name);checkNcrypt("NCryptOpenKey",NCryptOpenKey(provider,&key,w.c_str(),0,NCRYPT_SILENT_FLAG|flags));return key;}

struct Args{std::string aik;std::string requestKey;std::string otherKey;std::string rpId;std::string nonce;bool aikMachine{true};};
Args parseArgs(int argc,char** argv){if(argc<2||std::string(argv[1])!="collect")throw std::runtime_error("expected collect command");Args out;for(int i=2;i<argc;++i){std::string a=argv[i];auto value=[&](){if(i+1>=argc)throw std::runtime_error("missing argument value");return std::string(argv[++i]);};if(a=="--aik")out.aik=value();else if(a=="--request-key")out.requestKey=value();else if(a=="--other-key")out.otherKey=value();else if(a=="--rp-id")out.rpId=value();else if(a=="--nonce")out.nonce=value();else if(a=="--aik-user")out.aikMachine=false;else throw std::runtime_error("unknown argument");}if(out.aik.empty()||out.requestKey.empty()||out.rpId.empty()||out.nonce.empty())throw std::runtime_error("collector arguments incomplete");if(out.aik.size()>200||out.requestKey.size()>200||out.otherKey.size()>200||out.rpId.size()>1000||out.nonce.size()>4096)throw std::runtime_error("collector argument too large");return out;}

std::vector<std::uint8_t> attestServiceExchange(const std::uint8_t* data,size_t size){
  auto credential=std::make_shared<Azure::Identity::ClientSecretCredential>(requiredEnv("AZURE_TENANT_ID"),requiredEnv("AZURE_CLIENT_ID"),requiredEnv("AZURE_CLIENT_SECRET"));
  auto client=Azure::Security::Attestation::AttestationClient::Create(requiredEnv("AZURE_MAA_URI"),credential);
  auto response=client.AttestTpm(std::vector<std::uint8_t>(data,data+size));
  return response.Value.TpmResult;
}

std::vector<std::uint8_t> collectReport(const Args& args){
  att_set_log_level(att_log_level_none);
  NcryptHandle provider(openPlatformProvider());
  NcryptHandle aik(openNamedKey(static_cast<NCRYPT_PROV_HANDLE>(provider.h),args.aik,args.aikMachine?NCRYPT_MACHINE_KEY_FLAG:0));
  NcryptHandle requestKey(openNamedKey(static_cast<NCRYPT_PROV_HANDLE>(provider.h),args.requestKey,0));
  NcryptHandle otherKey;
  if(!args.otherKey.empty())otherKey.h=openNamedKey(static_cast<NCRYPT_PROV_HANDLE>(provider.h),args.otherKey,0);
  att_tpm_aik attAik=ATT_TPM_AIK_NCRYPT(static_cast<NCRYPT_KEY_HANDLE>(aik.h));
  att_tpm_key attKey=ATT_TPM_KEY_NCRYPT(static_cast<NCRYPT_KEY_HANDLE>(requestKey.h));
  att_tpm_key attOther{};
  if(otherKey.h)attOther=ATT_TPM_KEY_NCRYPT(static_cast<NCRYPT_KEY_HANDLE>(otherKey.h));
  std::vector<std::uint8_t> nonce(args.nonce.begin(),args.nonce.end());
  att_session_params_tpm params{nonce.data(),nonce.size(),args.rpId.c_str(),&attAik,&attKey,otherKey.h?&attOther:nullptr,otherKey.h?1u:0u};
  att_session session{};checkAtt("att_create_session",att_create_session(ATT_SESSION_TYPE_TPM,&params,&session));
  bool complete=false;std::vector<std::uint8_t> serverReply;
  while(!complete){att_buffer outbound=nullptr;size_t outboundSize=0;checkAtt("att_attest",att_attest(session.get(),serverReply.data(),serverReply.size(),&outbound,&outboundSize,&complete));if(outboundSize>0){if(outboundSize>4*1024*1024)throw std::runtime_error("attestation request too large");serverReply=attestServiceExchange(outbound.get(),outboundSize);if(serverReply.size()>4*1024*1024)throw std::runtime_error("attestation response too large");}}
  att_buffer report=nullptr;size_t reportSize=0;checkAtt("att_get_report",att_get_report(session.get(),&report,&reportSize));if(reportSize==0||reportSize>256*1024)throw std::runtime_error("attestation report size invalid");return std::vector<std::uint8_t>(report.get(),report.get()+reportSize);
}
}

int main(int argc,char** argv){try{Args args=parseArgs(argc,argv);auto report=collectReport(args);std::cout.write(reinterpret_cast<const char*>(report.data()),static_cast<std::streamsize>(report.size()));std::cout.flush();return 0;}catch(const Azure::Core::Credentials::AuthenticationException&){std::cerr<<"MAA authentication failed\n";return 21;}catch(const Azure::Core::RequestFailedException&){std::cerr<<"MAA request failed\n";return 22;}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 20;}}
