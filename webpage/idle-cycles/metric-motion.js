/* Integer readouts: larger changes tick faster; each frame advances at most one. */
(function(root){
 'use strict';
 class Counter{
  constructor(value=null){this.value=value;this.target=value;this.elapsed=0;this.interval=.5;}
  set(target){
   target=target===null?null:Math.round(target);
   if(target===this.target)return;
   this.target=target;this.elapsed=0;
   if(target===null){this.value=null;return;}
   if(this.value===null)this.value=0;
   this.interval=Math.max(1/60,.5/Math.max(1,Math.abs(target-this.value)));
  }
  advance(elapsed){
   if(this.value===this.target)return this.value;
   this.elapsed+=elapsed;
   if(this.elapsed+1e-8>=this.interval){
    this.value+=Math.sign(this.target-this.value);
    // Avoid a catch-up burst after a hidden tab or a slow frame.
    this.elapsed=Math.min(this.interval,this.elapsed-this.interval);
   }
   return this.value;
  }
 }
 root.MetricMotion={Counter};
})(typeof window!=='undefined'?window:globalThis);
