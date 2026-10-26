(() => {
  'use strict';
  window.describeHBADeed=i=>{
    const type=String(i.doc_type||'').toLowerCase(),role=i.role;
    let label='Supporting legal record',meaning='Read the original and parcel notes before treating this as evidence of a change in ownership.';
    if(/decree|judgment|jgmt|ordr|tax|taking|^tkg$|^tt$/.test(type)){
      label='Court or tax-title history';meaning='This concerns court proceedings or tax title. It is not automatically a voluntary purchase deed.';
    }else if(/foreclosure.*deed|mortgagee.*deed/.test(type)){
      label='Foreclosure deed';meaning='A foreclosure-related conveyance. Review the proceedings and exact parcel before connecting it to the ownership chain.';
    }else if(/discharge|^rel$/.test(type)){
      label='Release or discharge';meaning='A document releasing a mortgage, lien or other interest. It does not by itself record a purchase.';
    }else if(/mortgage|^mtg$/.test(type)){
      label='Mortgage / loan record';meaning='A financing record, not an ordinary sale deed. It may supply clues but does not establish the acquisition chain by itself.';
    }else if(/easement/.test(type)){
      label='Use-rights document';meaning='An easement concerns a right to use land. It is not automatically ownership of the road or land underneath.';
    }else if(/certificate|crtf|declaration|dcln|appointment/.test(type)){
      label='Trust, identity or authority record';meaning='Supporting information about a trust, person or legal authority. This is not automatically a transfer of this parcel.';
    }else if(/confirmatory/.test(type)){
      label='Correction / confirmation deed';meaning='Clarifies or confirms an earlier conveyance. It may not represent a new buyer or a new sale.';
    }else if(/deed/.test(type)){
      label='Deed / transfer record';meaning='Records a stated conveyance or property interest. A deed can transfer between family members or into a trust without a market sale.';
    }
    if(role==='Rejected / unrelated'){label='Not part of this property’s chain';meaning='Excluded from this property’s chain. Keep it only as research context, not as a proven transfer of this home.';}
    const stage=role==='Dataset endpoint'?'Latest collected record · not a current-owner certification':role==='Rejected / unrelated'?'Excluded research record':'Earlier or supporting record · continuity must be checked';
    return {label,meaning,stage};
  };
})();
