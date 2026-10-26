/* Image-coordinate geometry only. No claim of survey or hydrodynamic calibration. */
(() => {
  'use strict';
  const radians=Math.PI/180;
  const bearing=(dx,dy)=>(Math.atan2(dx,-dy)/radians+360)%360;
  const axis=b=>[Math.sin(b*radians),-Math.cos(b*radians)];
  const projection=(length,b,n)=>{
    const v=axis(b),norm=Math.hypot(...n);
    return Math.max(.1,length*Math.max(0,(v[0]*n[0]+v[1]*n[1])/norm));
  };
  window.HBAJettyGeometry={
    axis,bearing,projection,
    defaults:{
      A:{bearing:160,source:'Approximate visual centerline from the supplied 2020 site plan and modern aerial; not a transcribed survey bearing.'},
      C1:{bearing:bearing(12,29),source:'Visually digitized centerline on the aligned 1938 image: image points (602,514) to (614,543). Low-resolution photo estimate, not a survey.'},
      C2:{bearing:bearing(6,31),source:'Visually digitized centerline on the aligned 1938 image: image points (686,501) to (692,532). Low-resolution photo estimate, not a survey.'}
    },
    registration:{matrix:[1.470234521936127,0.00005648870428325113,-111.2125854944315,-0.00005648870428325113,1.470234521936127,-72.31812171725944],inliers:190,note:'Modern comparison crop registered to the simulation aerial using 190 matching image features. This aligns two modern image crops; it does not validate the earlier historical-image registration.'}
  };
})();
