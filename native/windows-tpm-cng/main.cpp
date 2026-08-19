#include <windows.h>
#include <ncrypt.h>
#include <bcrypt.h>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <stdexcept>
#include <cstdint>

#pragma comment(lib,"ncrypt.lib")
#pragma comment(lib,"bcrypt.lib")

namespace {
struct NcryptHandle {
    NCRYPT_HANDLE h{0};
    NcryptHandle()=default;
    explicit NcryptHandle(NCRYPT_HANDLE v):h(v){}
    ~NcryptHandle(){ if(h) NCryptFreeObject(h); }
    NcryptHandle(const NcryptHandle&)=delete;
    NcryptHandle& operator=(const NcryptHandle&)=delete;
};

[[noreturn]] void fail(const char* op, SECURITY_STATUS s){
    std::ostringstream oss; oss<<op<<" failed: 0x"<<std::hex<<std::uppercase<<static_cast<unsigned long>(s); throw std::runtime_error(oss.str());
}
void check(const char* op, SECURITY_STATUS s){ if(s!=ERROR_SUCCESS) fail(op,s); }

std::wstring widen(const std::string& in){
    if(in.empty()) return {};
    int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,in.data(),static_cast<int>(in.size()),nullptr,0);
    if(n<=0) throw std::runtime_error("invalid UTF-8");
    std::wstring out(static_cast<size_t>(n),L'\0');
    if(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,in.data(),static_cast<int>(in.size()),out.data(),n)<=0) throw std::runtime_error("invalid UTF-8");
    return out;
}
std::string jsonEscape(const std::string& s){
    std::ostringstream o; for(unsigned char c:s){ switch(c){case '"':o<<"\\\"";break;case '\\':o<<"\\\\";break;case '\n':o<<"\\n";break;case '\r':o<<"\\r";break;case '\t':o<<"\\t";break;default: if(c<0x20){o<<"\\u"<<std::hex<<std::setw(4)<<std::setfill('0')<<static_cast<int>(c);}else o<<c;}} return o.str();
}
std::string hexStatus(SECURITY_STATUS s){ std::ostringstream o;o<<"0x"<<std::hex<<std::uppercase<<static_cast<unsigned long>(s);return o.str(); }
std::string b64url(const unsigned char* data,size_t n){
    static constexpr char t[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    std::string out; out.reserve((n*4+2)/3);
    for(size_t i=0;i<n;i+=3){ unsigned v=static_cast<unsigned>(data[i])<<16; if(i+1<n)v|=static_cast<unsigned>(data[i+1])<<8; if(i+2<n)v|=data[i+2]; out.push_back(t[(v>>18)&63]); out.push_back(t[(v>>12)&63]); if(i+1<n)out.push_back(t[(v>>6)&63]); if(i+2<n)out.push_back(t[v&63]); }
    return out;
}
std::vector<unsigned char> hexDecode(const std::string& s){
    if(s.size()%2) throw std::runtime_error("hex length must be even");
    auto nib=[](char c)->int{if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;if(c>='A'&&c<='F')return c-'A'+10;return -1;};
    std::vector<unsigned char> out(s.size()/2); for(size_t i=0;i<out.size();++i){int a=nib(s[2*i]),b=nib(s[2*i+1]);if(a<0||b<0)throw std::runtime_error("invalid hex");out[i]=static_cast<unsigned char>((a<<4)|b);} return out;
}

NCRYPT_PROV_HANDLE openPlatformProvider(){
    NCRYPT_PROV_HANDLE p=0; check("NCryptOpenStorageProvider",NCryptOpenStorageProvider(&p,MS_PLATFORM_CRYPTO_PROVIDER,0));
    DWORD impl=0,cb=0; check("NCryptGetProperty(Impl Type)",NCryptGetProperty(p,NCRYPT_IMPL_TYPE_PROPERTY,reinterpret_cast<PBYTE>(&impl),sizeof(impl),&cb,0));
    if((impl & NCRYPT_IMPL_HARDWARE_FLAG)==0){NCryptFreeObject(p);throw std::runtime_error("Microsoft Platform Crypto Provider is not reporting hardware-backed implementation");}
    if((impl & NCRYPT_IMPL_SOFTWARE_FLAG)!=0){NCryptFreeObject(p);throw std::runtime_error("Platform provider unexpectedly reports software implementation");}
    return p;
}

DWORD implType(NCRYPT_PROV_HANDLE p){DWORD v=0,cb=0;check("NCryptGetProperty(Impl Type)",NCryptGetProperty(p,NCRYPT_IMPL_TYPE_PROPERTY,reinterpret_cast<PBYTE>(&v),sizeof(v),&cb,0));return v;}

NCRYPT_KEY_HANDLE openKey(NCRYPT_PROV_HANDLE p,const std::wstring& name){NCRYPT_KEY_HANDLE k=0;check("NCryptOpenKey",NCryptOpenKey(p,&k,name.c_str(),0,0));return k;}

std::string publicJwk(NCRYPT_KEY_HANDLE k){
    DWORD cb=0;check("NCryptExportKey(size)",NCryptExportKey(k,0,BCRYPT_ECCPUBLIC_BLOB,nullptr,nullptr,0,&cb,0));
    std::vector<unsigned char> blob(cb);check("NCryptExportKey",NCryptExportKey(k,0,BCRYPT_ECCPUBLIC_BLOB,nullptr,blob.data(),cb,&cb,0));
    if(cb<sizeof(BCRYPT_ECCKEY_BLOB))throw std::runtime_error("invalid ECC public blob");
    auto* hdr=reinterpret_cast<const BCRYPT_ECCKEY_BLOB*>(blob.data());
    if(hdr->dwMagic!=BCRYPT_ECDSA_PUBLIC_P256_MAGIC||hdr->cbKey!=32)throw std::runtime_error("key is not ECDSA P-256");
    const unsigned char* x=blob.data()+sizeof(BCRYPT_ECCKEY_BLOB); const unsigned char* y=x+hdr->cbKey;
    if(sizeof(BCRYPT_ECCKEY_BLOB)+2*hdr->cbKey>cb)throw std::runtime_error("truncated ECC public blob");
    std::ostringstream o;o<<"{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\""<<b64url(x,32)<<"\",\"y\":\""<<b64url(y,32)<<"\"}";return o.str();
}

DWORD exportPolicy(NCRYPT_KEY_HANDLE k){DWORD v=0,cb=0;SECURITY_STATUS s=NCryptGetProperty(k,NCRYPT_EXPORT_POLICY_PROPERTY,reinterpret_cast<PBYTE>(&v),sizeof(v),&cb,0);if(s==NTE_NOT_FOUND)return 0;check("NCryptGetProperty(Export Policy)",s);return v;}
void assertPrivateNonExportable(NCRYPT_KEY_HANDLE k){DWORD p=exportPolicy(k);if(p&(NCRYPT_ALLOW_EXPORT_FLAG|NCRYPT_ALLOW_PLAINTEXT_EXPORT_FLAG|NCRYPT_ALLOW_ARCHIVING_FLAG|NCRYPT_ALLOW_PLAINTEXT_ARCHIVING_FLAG))throw std::runtime_error("private export policy is enabled");}

int cmdProbe(){
    try{NcryptHandle p(openPlatformProvider());DWORD impl=implType(static_cast<NCRYPT_PROV_HANDLE>(p.h));std::cout<<"{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"provider\":\"TPM\",\"nativeProvider\":\"Microsoft Platform Crypto Provider\",\"available\":true,\"hardwareBacked\":true,\"implType\":"<<impl<<"}\n";return 0;}
    catch(const std::exception& e){std::cout<<"{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"provider\":\"TPM\",\"nativeProvider\":\"Microsoft Platform Crypto Provider\",\"available\":false,\"hardwareBacked\":false,\"reason\":\""<<jsonEscape(e.what())<<"\"}\n";return 20;}
}
int cmdCreate(const std::string& keyName){
    if(keyName.empty()||keyName.size()>200)throw std::runtime_error("invalid key name");NcryptHandle p(openPlatformProvider());
    NCRYPT_KEY_HANDLE raw=0;auto w=widen(keyName);check("NCryptCreatePersistedKey",NCryptCreatePersistedKey(static_cast<NCRYPT_PROV_HANDLE>(p.h),&raw,BCRYPT_ECDSA_P256_ALGORITHM,w.c_str(),0,0));NcryptHandle k(raw);
    DWORD exportNone=0;check("NCryptSetProperty(Export Policy)",NCryptSetProperty(raw,NCRYPT_EXPORT_POLICY_PROPERTY,reinterpret_cast<PBYTE>(&exportNone),sizeof(exportNone),0));
    check("NCryptFinalizeKey",NCryptFinalizeKey(raw,0));assertPrivateNonExportable(raw);
    std::cout<<"{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"operation\":\"create-p256\",\"provider\":\"TPM\",\"keyName\":\""<<jsonEscape(keyName)<<"\",\"hardwareBacked\":true,\"exportable\":false,\"publicJwk\":"<<publicJwk(raw)<<"}\n";return 0;
}
int cmdDescribe(const std::string& keyName){NcryptHandle p(openPlatformProvider());NcryptHandle k(openKey(static_cast<NCRYPT_PROV_HANDLE>(p.h),widen(keyName)));assertPrivateNonExportable(static_cast<NCRYPT_KEY_HANDLE>(k.h));std::cout<<"{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"operation\":\"describe\",\"provider\":\"TPM\",\"keyName\":\""<<jsonEscape(keyName)<<"\",\"hardwareBacked\":true,\"exportable\":false,\"publicJwk\":"<<publicJwk(static_cast<NCRYPT_KEY_HANDLE>(k.h))<<"}\n";return 0;}
int cmdSign(const std::string& keyName,const std::string& hashHex){auto hash=hexDecode(hashHex);if(hash.size()!=32)throw std::runtime_error("sign-es256 requires a 32-byte SHA-256 digest");NcryptHandle p(openPlatformProvider());NcryptHandle k(openKey(static_cast<NCRYPT_PROV_HANDLE>(p.h),widen(keyName)));assertPrivateNonExportable(static_cast<NCRYPT_KEY_HANDLE>(k.h));DWORD cb=0;check("NCryptSignHash(size)",NCryptSignHash(static_cast<NCRYPT_KEY_HANDLE>(k.h),nullptr,hash.data(),static_cast<DWORD>(hash.size()),nullptr,0,&cb,0));std::vector<unsigned char> sig(cb);check("NCryptSignHash",NCryptSignHash(static_cast<NCRYPT_KEY_HANDLE>(k.h),nullptr,hash.data(),static_cast<DWORD>(hash.size()),sig.data(),cb,&cb,0));sig.resize(cb);std::cout<<"{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"operation\":\"sign-es256\",\"provider\":\"TPM\",\"keyName\":\""<<jsonEscape(keyName)<<"\",\"signatureEncoding\":\"IEEE-P1363\",\"signature\":\""<<b64url(sig.data(),sig.size())<<"\"}\n";return 0;}
}

int main(int argc,char** argv){
    try{
        if(argc<2){std::cerr<<"usage: cieav-windows-tpm-cng <probe|create-p256|describe|sign-es256> ...\n";return 2;}
        std::string cmd=argv[1];if(cmd=="probe")return cmdProbe();if(cmd=="create-p256"&&argc==3)return cmdCreate(argv[2]);if(cmd=="describe"&&argc==3)return cmdDescribe(argv[2]);if(cmd=="sign-es256"&&argc==4)return cmdSign(argv[2],argv[3]);std::cerr<<"invalid command\n";return 2;
    }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}
}
