import {describe,expect,it} from "vitest";
import {assertCloudPrivacyBaseline,assertCloudPrivacyIngress,privacyReduceContext} from "./privacy.js";

const raw:any={
  requestId:"request-privacy-12345678",
  url:"https://example.test/checkout?token=secret-query#private",
  origin:"https://example.test",
  title:"Checkout user@example.com",
  pageText:"FULL PRIVATE PAGE password_value 4111 1111 1111 1111",
  nearbyText:"OTP 123456 and Bearer abcdefghijklmnopqrstuvwxyz123456",
  element:{tag:"button",text:"Pay 4111 1111 1111 1111",href:"https://example.test/pay?session=secret"},
  form:{
    action:"https://example.test/pay?csrf=secret",
    method:"POST",
    fields:[{name:"password_value",type:"password",label:"Password user@example.com",required:true,redacted:false,dataCategory:"CREDENTIAL",value:"super-secret"}],
    fileNames:["Aravindh-passport-123456.pdf"],
    submitterText:"Confirm OTP 123456"
  },
  timestamp:"2026-08-12T12:00:00.000Z",
  clientVersion:"0.7.0"
};

describe("privacy model boundary",()=>{
  it("reconstructs an allowlisted and redacted model packet",()=>{
    const reduced=privacyReduceContext(raw);
    const serialized=JSON.stringify(reduced);
    expect(reduced.url).toBe("https://example.test/checkout");
    expect(reduced.origin).toBe("https://example.test");
    expect((reduced as any).pageText).toBeUndefined();
    expect(reduced.element.href).toBe("https://example.test/pay");
    expect(reduced.form?.action).toBe("https://example.test/pay");
    expect(reduced.form?.fields[0]?.name).toBe("password_value"); // field metadata is permitted; field values are not
    expect(reduced.form?.fields[0]?.redacted).toBe(true);
    expect(reduced.form?.fileNames).toEqual(["[selected-file.pdf]"]);
    for(const secret of ["secret-query","super-secret","123456","4111 1111 1111 1111","Aravindh-passport","abcdefghijklmnopqrstuvwxyz123456","user@example.com"]){expect(serialized).not.toContain(secret)}
    expect(()=>assertCloudPrivacyIngress(reduced)).not.toThrow();
  });

  it("rejects cloud packets that only claim privacy without satisfying it",()=>{
    const good=privacyReduceContext(raw) as any;
    const cases=[
      {...good,pageText:"private page"},
      {...good,url:"https://example.test/checkout?token=oops"},
      {...good,unexpected:"raw"},
      {...good,form:{...good.form,fileNames:["real-passport.pdf"]}},
      {...good,form:{...good.form,fields:[{...good.form.fields[0],redacted:false}]}},
      {...good,nearbyText:"Bearer abcdefghijklmnopqrstuvwxyz123456"}
    ];
    for(const value of cases)expect(()=>assertCloudPrivacyIngress(value)).toThrow();
  });

  it("restricts cloud baseline metadata to the deterministic allowlist",()=>{
    expect(()=>assertCloudPrivacyBaseline({actionType:"access.grant",risk:"MEDIUM",reversibility:"COMPENSABLE",confidence:.8,dataCategories:["ACCOUNT"]})).not.toThrow();
    expect(()=>assertCloudPrivacyBaseline({actionType:"access.grant",risk:"MEDIUM",reversibility:"COMPENSABLE",confidence:.8,dataCategories:["ACCOUNT"],rawValue:"secret"})).toThrow();
  });
});
