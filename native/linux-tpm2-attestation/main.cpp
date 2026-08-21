#include <tss2/tss2_esys.h>
#include <tss2/tss2_mu.h>
#include <tss2/tss2_tctildr.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
constexpr const char* PROTOCOL="CIEAV_LINUX_TPM2_ESAPI_ATTESTATION_V1";
constexpr size_t NONCE_BYTES=32;
constexpr uint32_t MAX_SRTM_MASK=0x0000ffffu;

[[noreturn]] void fail(const std::string& code){throw std::runtime_error(code);}
void check(TSS2_RC rc,const char* op){if(rc!=TSS2_RC_SUCCESS){std::ostringstream s;s<<op<<":0x"<<std::hex<<std::setw(8)<<std::setfill('0')<<rc;fail(s.str());}}

uint32_t parseHandle(const std::string& text){if(text.size()!=10||text.rfind("0x81",0)!=0)fail("persistent_handle_format");for(size_t i=2;i<text.size();++i)if(!std::isxdigit(static_cast<unsigned char>(text[i])))fail("persistent_handle_format");unsigned long value=std::stoul(text,nullptr,16);if(value<0x81000000ul||value>0x81fffffful)fail("persistent_handle_range");return static_cast<uint32_t>(value);}
std::array<uint8_t,NONCE_BYTES> parseNonce(const std::string& hex){if(hex.size()!=NONCE_BYTES*2)fail("nonce_hex_size");std::array<uint8_t,NONCE_BYTES> out{};auto nibble=[](char c)->uint8_t{if(c>='0'&&c<='9')return static_cast<uint8_t>(c-'0');if(c>='a'&&c<='f')return static_cast<uint8_t>(c-'a'+10);if(c>='A'&&c<='F')return static_cast<uint8_t>(c-'A'+10);fail("nonce_hex_encoding");};for(size_t i=0;i<out.size();++i)out[i]=static_cast<uint8_t>((nibble(hex[i*2])<<4)|nibble(hex[i*2+1]));return out;}
uint32_t parsePcrMask(const std::string& text){if(text.size()<3||text.size()>10||text.rfind("0x",0)!=0)fail("pcr_mask_format");for(size_t i=2;i<text.size();++i)if(!std::isxdigit(static_cast<unsigned char>(text[i])))fail("pcr_mask_format");unsigned long value=std::stoul(text,nullptr,16);if(value==0||value>MAX_SRTM_MASK)fail("pcr_mask_range");return static_cast<uint32_t>(value);}
std::string jsonEscape(const std::string& s){std::ostringstream o;for(unsigned char c:s){switch(c){case '"':o<<"\\\"";break;case '\\':o<<"\\\\";break;case '\b':o<<"\\b";break;case '\f':o<<"\\f";break;case '\n':o<<"\\n";break;case '\r':o<<"\\r";break;case '\t':o<<"\\t";break;default:if(c<0x20)o<<"\\u"<<std::hex<<std::setw(4)<<std::setfill('0')<<static_cast<int>(c)<<std::dec;else o<<static_cast<char>(c);}}return o.str();}
std::string b64url(const uint8_t* data,size_t len){static constexpr char table[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";std::string out;out.reserve((len*4+2)/3);for(size_t i=0;i<len;i+=3){uint32_t n=static_cast<uint32_t>(data[i])<<16;if(i+1<len)n|=static_cast<uint32_t>(data[i+1])<<8;if(i+2<len)n|=data[i+2];out.push_back(table[(n>>18)&63]);out.push_back(table[(n>>12)&63]);if(i+1<len)out.push_back(table[(n>>6)&63]);if(i+2<len)out.push_back(table[n&63]);}return out;}
std::string b64url(const std::vector<uint8_t>& v){return b64url(v.data(),v.size());}

struct EsysFree{template<class T>void operator()(T* p)const noexcept{if(p)Esys_Free(p);}};
template<class T>using EsysPtr=std::unique_ptr<T,EsysFree>;

class Context{
 public:
  explicit Context(const std::string& tcti){check(Tss2_TctiLdr_Initialize(tcti.c_str(),&tcti_),"Tss2_TctiLdr_Initialize");try{check(Esys_Initialize(&esys_,tcti_,nullptr),"Esys_Initialize");}catch(...){Tss2_TctiLdr_Finalize(&tcti_);throw;}}
  ~Context(){if(esys_)Esys_Finalize(&esys_);if(tcti_)Tss2_TctiLdr_Finalize(&tcti_);}
  ESYS_CONTEXT* get()const{return esys_;}
 private:TSS2_TCTI_CONTEXT* tcti_=nullptr;ESYS_CONTEXT* esys_=nullptr;
};

class TrHandle{
 public:
  TrHandle(ESYS_CONTEXT* ctx,TPM2_HANDLE raw):ctx_(ctx){check(Esys_TR_FromTPMPublic(ctx_,raw,ESYS_TR_NONE,ESYS_TR_NONE,ESYS_TR_NONE,&value_),"Esys_TR_FromTPMPublic");TPM2B_AUTH empty{};empty.size=0;check(Esys_TR_SetAuth(ctx_,value_,&empty),"Esys_TR_SetAuth");}
  ~TrHandle(){if(value_!=ESYS_TR_NONE)Esys_TR_Close(ctx_,&value_);}
  ESYS_TR get()const{return value_;}
 private:ESYS_CONTEXT* ctx_;ESYS_TR value_=ESYS_TR_NONE;
};

struct PublicEvidence{std::vector<uint8_t> publicBlob;std::vector<uint8_t> name;std::vector<uint8_t> qualifiedName;};
PublicEvidence readPublic(ESYS_CONTEXT* ctx,ESYS_TR handle){TPM2B_PUBLIC* pubRaw=nullptr;TPM2B_NAME* nameRaw=nullptr;TPM2B_NAME* qnRaw=nullptr;check(Esys_ReadPublic(ctx,handle,ESYS_TR_NONE,ESYS_TR_NONE,ESYS_TR_NONE,&pubRaw,&nameRaw,&qnRaw),"Esys_ReadPublic");EsysPtr<TPM2B_PUBLIC> pub(pubRaw);EsysPtr<TPM2B_NAME> name(nameRaw);EsysPtr<TPM2B_NAME> qn(qnRaw);std::vector<uint8_t> marshalled(4096);size_t off=0;check(Tss2_MU_TPM2B_PUBLIC_Marshal(pub.get(),marshalled.data(),marshalled.size(),&off),"Tss2_MU_TPM2B_PUBLIC_Marshal");marshalled.resize(off);return{std::move(marshalled),std::vector<uint8_t>(name->name,name->name+name->size),std::vector<uint8_t>(qn->name,qn->name+qn->size)};}
std::vector<uint8_t> marshalAttest(const TPM2B_ATTEST& value){std::vector<uint8_t> out(static_cast<size_t>(value.size)+2);out[0]=static_cast<uint8_t>(value.size>>8);out[1]=static_cast<uint8_t>(value.size);std::memcpy(out.data()+2,value.attestationData,value.size);return out;}
std::vector<uint8_t> marshalSignature(const TPMT_SIGNATURE& value){std::vector<uint8_t> out(2048);size_t off=0;check(Tss2_MU_TPMT_SIGNATURE_Marshal(&value,out.data(),out.size(),&off),"Tss2_MU_TPMT_SIGNATURE_Marshal");out.resize(off);return out;}
TPM2B_DATA qualifying(const std::array<uint8_t,NONCE_BYTES>& nonce){TPM2B_DATA out{};out.size=static_cast<UINT16>(nonce.size());std::memcpy(out.buffer,nonce.data(),nonce.size());return out;}

struct SignedEvidence{std::vector<uint8_t> attest;std::vector<uint8_t> signature;};
SignedEvidence certify(ESYS_CONTEXT* ctx,ESYS_TR subject,ESYS_TR ak,const std::array<uint8_t,NONCE_BYTES>& nonce){TPM2B_DATA q=qualifying(nonce);TPMT_SIG_SCHEME scheme{};scheme.scheme=TPM2_ALG_NULL;TPM2B_ATTEST* attestRaw=nullptr;TPMT_SIGNATURE* sigRaw=nullptr;check(Esys_Certify(ctx,subject,ak,ESYS_TR_PASSWORD,ESYS_TR_PASSWORD,ESYS_TR_NONE,&q,&scheme,&attestRaw,&sigRaw),"Esys_Certify");EsysPtr<TPM2B_ATTEST> attest(attestRaw);EsysPtr<TPMT_SIGNATURE> sig(sigRaw);return{marshalAttest(*attest),marshalSignature(*sig)};}
SignedEvidence quote(ESYS_CONTEXT* ctx,ESYS_TR ak,const std::array<uint8_t,NONCE_BYTES>& nonce,uint32_t mask){TPM2B_DATA q=qualifying(nonce);TPMT_SIG_SCHEME scheme{};scheme.scheme=TPM2_ALG_NULL;TPML_PCR_SELECTION selection{};selection.count=1;selection.pcrSelections[0].hash=TPM2_ALG_SHA256;selection.pcrSelections[0].sizeofSelect=3;selection.pcrSelections[0].pcrSelect[0]=static_cast<uint8_t>(mask&0xff);selection.pcrSelections[0].pcrSelect[1]=static_cast<uint8_t>((mask>>8)&0xff);selection.pcrSelections[0].pcrSelect[2]=0;TPM2B_ATTEST* attestRaw=nullptr;TPMT_SIGNATURE* sigRaw=nullptr;check(Esys_Quote(ctx,ak,ESYS_TR_PASSWORD,ESYS_TR_NONE,ESYS_TR_NONE,&q,&scheme,&selection,&attestRaw,&sigRaw),"Esys_Quote");EsysPtr<TPM2B_ATTEST> attest(attestRaw);EsysPtr<TPMT_SIGNATURE> sig(sigRaw);return{marshalAttest(*attest),marshalSignature(*sig)};}

std::string field(const std::string& name,const std::string& value){return "\""+name+"\":\""+jsonEscape(value)+"\"";}
void emit(const PublicEvidence& ek,const PublicEvidence& ak,const PublicEvidence& subject,const SignedEvidence& cert,const SignedEvidence& q,const std::string& certifyNonce,const std::string& quoteNonce,uint32_t mask){std::ostringstream o;o<<"{"<<field("protocol",PROTOCOL)<<","<<field("operation","collect")<<",\"provider\":\"TPM2_ESAPI\",\"pcrHashAlgorithm\":\"SHA256\",\"pcrMask\":"<<mask<<","<<field("certifyNonce",certifyNonce)<<","<<field("quoteNonce",quoteNonce)<<",\"ek\":{"<<field("public",b64url(ek.publicBlob))<<","<<field("name",b64url(ek.name))<<","<<field("qualifiedName",b64url(ek.qualifiedName))<<"},\"ak\":{"<<field("public",b64url(ak.publicBlob))<<","<<field("name",b64url(ak.name))<<","<<field("qualifiedName",b64url(ak.qualifiedName))<<"},\"subject\":{"<<field("public",b64url(subject.publicBlob))<<","<<field("name",b64url(subject.name))<<","<<field("qualifiedName",b64url(subject.qualifiedName))<<"},"<<field("certifyAttest",b64url(cert.attest))<<","<<field("certifySignature",b64url(cert.signature))<<","<<field("quoteAttest",b64url(q.attest))<<","<<field("quoteSignature",b64url(q.signature))<<"}";std::cout<<o.str()<<"\n";}

struct Args{std::string tcti;uint32_t ek=0,ak=0,subject=0,mask=0;std::string certifyNonceHex,quoteNonceHex;};
Args args(int argc,char** argv){if(argc<2||std::string(argv[1])!="collect")fail("usage_collect_required");Args out;auto take=[&](int& i,const char* flag)->std::string{if(i+1>=argc)fail(std::string("missing_value:")+flag);return argv[++i];};for(int i=2;i<argc;++i){std::string a=argv[i];if(a=="--tcti")out.tcti=take(i,"--tcti");else if(a=="--ek-handle")out.ek=parseHandle(take(i,"--ek-handle"));else if(a=="--ak-handle")out.ak=parseHandle(take(i,"--ak-handle"));else if(a=="--subject-handle")out.subject=parseHandle(take(i,"--subject-handle"));else if(a=="--certify-nonce")out.certifyNonceHex=take(i,"--certify-nonce");else if(a=="--quote-nonce")out.quoteNonceHex=take(i,"--quote-nonce");else if(a=="--pcr-mask")out.mask=parsePcrMask(take(i,"--pcr-mask"));else fail("unknown_argument:"+a);}if(out.tcti.empty()||out.tcti.size()>300)fail("tcti_required");for(char c:out.tcti)if(!(std::isalnum(static_cast<unsigned char>(c))||std::string("_.,:=+-/").find(c)!=std::string::npos))fail("tcti_format");if(!out.ek||!out.ak||!out.subject||!out.mask||out.certifyNonceHex.empty()||out.quoteNonceHex.empty())fail("required_argument_missing");return out;}
}

int main(int argc,char** argv){try{Args a=args(argc,argv);auto certifyNonce=parseNonce(a.certifyNonceHex),quoteNonce=parseNonce(a.quoteNonceHex);if(certifyNonce==quoteNonce)fail("nonce_domain_separation_required");Context context(a.tcti);TrHandle ek(context.get(),a.ek),ak(context.get(),a.ak),subject(context.get(),a.subject);auto ekPub=readPublic(context.get(),ek.get()),akPub=readPublic(context.get(),ak.get()),subjectPub=readPublic(context.get(),subject.get());auto cert=certify(context.get(),subject.get(),ak.get(),certifyNonce);auto q=quote(context.get(),ak.get(),quoteNonce,a.mask);emit(ekPub,akPub,subjectPub,cert,q,a.certifyNonceHex,a.quoteNonceHex,a.mask);return 0;}catch(const std::exception& e){std::cerr<<"CIEAV Linux TPM2 ESAPI collector failed: "<<e.what()<<"\n";return 20;}}
