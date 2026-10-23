// Apply before first paint; a manual choice takes precedence over the OS theme.
(function(){
 'use strict';
 const system=matchMedia('(prefers-color-scheme: dark)'),root=document.documentElement;
 let preference=null;
 try{const saved=localStorage.getItem('idle-cycles-theme');if(saved==='dark'||saved==='light')preference=saved;}catch{}
 function apply(){
  const dark=preference?preference==='dark':system.matches;
  root.dataset.theme=dark?'dark':'light';
  const toggle=document.getElementById('theme-toggle');
  if(toggle){
   const label=dark?'Switch to light mode':'Switch to dark mode';
   toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-pressed',String(dark));toggle.title=label;
  }
 }
 apply();
 system.addEventListener('change',apply);
 document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('theme-toggle').addEventListener('click',()=>{
   preference=root.dataset.theme==='dark'?'light':'dark';
   try{localStorage.setItem('idle-cycles-theme',preference);}catch{}
   apply();
  });
  apply();
 });
})();
