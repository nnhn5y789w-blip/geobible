"use strict";
let map;
let dailyQuestions=[];
let current=0;
let totalScore=0;
let selectedLatLng=null;
let guessMarker=null;
let answerMarker=null;
let answerLine=null;
let roundScores=[];

const $=id=>document.getElementById(id);

function hashString(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(array,rng){const a=[...array];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function localDateKey(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function chooseDaily(all,dateKey){
  const rng=mulberry32(hashString("GeoBible-"+dateKey));
  function choose(category,count){
    const records=all.filter(q=>q.category===category);
    const keys=shuffle([...new Set(records.map(q=>q.key))],rng).slice(0,count);
    return keys.map(key=>{const choices=records.filter(q=>q.key===key);return choices[Math.floor(rng()*choices.length)];});
  }
  return shuffle([...choose("bible",4),...choose("history",3)],rng);
}
function radians(value){return value*Math.PI/180;}
function distanceMiles(a,b){const R=3958.8;const dLat=radians(b.lat-a.lat),dLng=radians(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function scoreForDistance(miles){return Math.max(0,Math.round(5000*Math.exp(-miles/450)));}
function removeResultLayers(){[guessMarker,answerMarker,answerLine].forEach(layer=>{if(layer&&map.hasLayer(layer))map.removeLayer(layer);});guessMarker=answerMarker=answerLine=null;selectedLatLng=null;}
function showQuestion(){
  removeResultLayers();
  const q=dailyQuestions[current];
  $("progress").textContent=`Question ${current+1} of 7`;
  $("score").textContent=`Score: ${totalScore.toLocaleString()}`;
  $("category").textContent=q.category==="bible"?"Bible geography":"Protestant history";
  $("question").textContent=q.question;
  $("instruction").textContent="Click the map to place your guess, then submit it.";
  $("result").hidden=true;
  $("submitButton").hidden=false;
  $("submitButton").disabled=true;
  $("nextButton").hidden=true;
  map.setView(q.category==="bible"?[32,35]:[38,-10],q.category==="bible"?5:2,{animate:false});
}
function selectGuess(event){
  selectedLatLng=event.latlng;
  if(guessMarker)guessMarker.setLatLng(selectedLatLng);else guessMarker=L.circleMarker(selectedLatLng,{radius:8,color:"#0b5ed7",weight:3,fillColor:"#6ea8fe",fillOpacity:.8}).addTo(map);
  $("submitButton").disabled=false;
}
function submitGuess(){
  if(!selectedLatLng)return;
  const q=dailyQuestions[current];
  const answer={lat:q.lat,lng:q.lng};
  const miles=distanceMiles(selectedLatLng,answer);
  const points=scoreForDistance(miles);
  totalScore+=points;roundScores.push(points);
  answerMarker=L.circleMarker(answer,{radius:9,color:"#8a4b08",weight:3,fillColor:"#f2b84b",fillOpacity:.9}).addTo(map).bindPopup(`<strong>${q.answer}</strong>`).openPopup();
  answerLine=L.polyline([selectedLatLng,answer],{color:"#b14435",weight:3,dashArray:"7 7"}).addTo(map);
  map.fitBounds(L.latLngBounds([selectedLatLng,answer]).pad(.25),{maxZoom:8});
  $("result").innerHTML=`<strong>${q.answer}</strong><br>${q.category==="bible"?"Scripture":"Figure / topic"}: ${q.reference}<br>${q.note}<br><strong>${Math.round(miles).toLocaleString()} miles away · ${points.toLocaleString()} points</strong>`;
  $("result").hidden=false;
  $("score").textContent=`Score: ${totalScore.toLocaleString()}`;
  $("submitButton").hidden=true;
  $("nextButton").hidden=false;
  $("nextButton").textContent=current===dailyQuestions.length-1?"See final score":"Next question";
  map.off("click",selectGuess);
}
function nextQuestion(){
  current++;
  if(current>=dailyQuestions.length){finishGame();return;}
  map.on("click",selectGuess);showQuestion();
}
function finishGame(){
  removeResultLayers();
  $("progress").textContent="Complete";
  $("question").textContent=`Final score: ${totalScore.toLocaleString()} / 35,000`;
  $("instruction").textContent="Come back tomorrow for seven new questions.";
  $("category").textContent="Daily complete";
  $("result").hidden=true;$("nextButton").hidden=true;$("submitButton").hidden=true;$("shareButton").hidden=false;
  localStorage.setItem("geobible-"+localDateKey(),JSON.stringify({score:totalScore,roundScores}));
}
async function shareResults(){
  const blocks=roundScores.map(s=>s>=4000?"🟩":s>=2500?"🟨":s>=1000?"🟧":"🟥").join("");
  const text=`GeoBible ${localDateKey()}\n${blocks}\n${totalScore.toLocaleString()} / 35,000`;
  try{if(navigator.share)await navigator.share({title:"GeoBible Daily",text});else{await navigator.clipboard.writeText(text);alert("Results copied to your clipboard.");}}catch(error){console.log(error);}
}
async function init(){
  try{
    if(typeof L==="undefined")throw new Error("Leaflet did not load. Check whether a browser extension or network filter is blocking cdn.jsdelivr.net.");
    map=L.map("map",{worldCopyJump:true,minZoom:2}).setView([32,20],3);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{subdomains:"abcd",maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'}).addTo(map);
    const response=await fetch("questions.json",{cache:"no-store"});
    if(!response.ok)throw new Error(`questions.json returned HTTP ${response.status}. Make sure it is in the repository root.`);
    const all=await response.json();
    if(!Array.isArray(all)||all.length<7)throw new Error("questions.json is missing or invalid.");
    const dateKey=localDateKey();
    $("dateLabel").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    dailyQuestions=chooseDaily(all,dateKey);
    map.on("click",selectGuess);
    showQuestion();
  }catch(error){
    console.error(error);
    $("error").textContent="The game could not load: "+error.message;
    $("error").hidden=false;
    $("question").textContent="GeoBible needs attention";
    $("progress").textContent="Load error";
  }
}
$("submitButton").addEventListener("click",submitGuess);
$("nextButton").addEventListener("click",nextQuestion);
$("shareButton").addEventListener("click",shareResults);
window.addEventListener("DOMContentLoaded",init);
