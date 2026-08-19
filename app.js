"use strict";

let map, dailyQuestions = [], current = 0, totalScore = 0, selectedLatLng = null;
let guessMarker = null, answerMarker = null, answerLine = null, roundScores = [];
let modernLayer = null, biblicalLayer = null;

const $ = id => document.getElementById(id);

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function () {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, random) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function localDateKey() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function chooseDaily(allQuestions, dateKey) {
  const random = mulberry32(hashString("GeoBible-" + dateKey));

  function choose(category, count) {
    const rows = allQuestions.filter(question => question.category === category);
    const keys = shuffle([...new Set(rows.map(question => question.key))], random).slice(0, count);

    return keys.map(key => {
      const choices = rows.filter(question => question.key === key);
      return choices[Math.floor(random() * choices.length)];
    });
  }

  return shuffle([...choose("bible", 4), ...choose("history", 3)], random);
}

function radians(value) {
  return value * Math.PI / 180;
}

function distanceMiles(pointA, pointB) {
  const earthRadius = 3958.8;
  const latitudeChange = radians(pointB.lat - pointA.lat);
  const longitudeChange = radians(pointB.lng - pointA.lng);
  const value = Math.sin(latitudeChange / 2) ** 2
    + Math.cos(radians(pointA.lat))
    * Math.cos(radians(pointB.lat))
    * Math.sin(longitudeChange / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function scoreForDistance(miles) {
  return Math.max(0, Math.round(5000 * Math.exp(-miles / 450)));
}

function blocksFor(scores) {
  return scores.map(score =>
    score >= 4000 ? "🟩" :
    score >= 2500 ? "🟨" :
    score >= 1000 ? "🟧" : "🟥"
  ).join("");
}

function addBiblicalLabel(text, latitude, longitude, type = "region") {
  L.marker([latitude, longitude], {
    opacity: 0,
    interactive: false
  }).bindTooltip(text, {
    permanent: true,
    direction: "center",
    className: `biblical-label biblical-label-${type}`,
    opacity: 1
  }).addTo(biblicalLayer);
}

function createBiblicalLayer() {
  biblicalLayer = L.layerGroup();

  const regions = [
    ["GALILEE", 32.78, 35.38],
    ["SAMARIA", 32.22, 35.20],
    ["JUDEA", 31.62, 35.18],
    ["DECAPOLIS", 32.40, 35.90],
    ["PEREA", 31.92, 35.78],
    ["PHILISTIA", 31.75, 34.60],
    ["MOAB", 31.45, 35.82],
    ["EDOM", 30.55, 35.55],
    ["AMMON", 31.95, 35.98],
    ["PHOENICIA", 33.50, 35.35],
    ["CILICIA", 36.82, 34.65],
    ["SYRIA", 35.00, 37.00],
    ["ASSYRIA", 36.15, 43.20],
    ["BABYLONIA", 32.55, 44.45]
  ];

  const cities = [
    ["Jerusalem", 31.7683, 35.2137],
    ["Bethlehem", 31.7054, 35.2024],
    ["Nazareth", 32.6996, 35.3035],
    ["Capernaum", 32.8803, 35.5750],
    ["Jericho", 31.8611, 35.4618],
    ["Hebron", 31.5326, 35.0998],
    ["Joppa", 32.0504, 34.7522],
    ["Caesarea", 32.5004, 34.8920],
    ["Damascus", 33.5138, 36.2765],
    ["Antioch", 36.2021, 36.1600],
    ["Tarsus", 36.9165, 34.8951],
    ["Ephesus", 37.9390, 27.3410],
    ["Corinth", 37.9386, 22.9322],
    ["Athens", 37.9838, 23.7275],
    ["Philippi", 41.0138, 24.2867],
    ["Thessalonica", 40.6401, 22.9444],
    ["Rome", 41.9028, 12.4964],
    ["Nineveh", 36.3590, 43.1520],
    ["Babylon", 32.5420, 44.4210],
    ["Ur", 30.9625, 46.1030]
  ];

  const waters = [
    ["Sea of Galilee", 32.82, 35.60],
    ["Jordan River", 31.98, 35.56],
    ["Dead Sea", 31.45, 35.50]
  ];

  regions.forEach(label => addBiblicalLabel(...label, "region"));
  cities.forEach(label => addBiblicalLabel(...label, "city"));
  waters.forEach(label => addBiblicalLabel(...label, "water"));

  return biblicalLayer;
}

function addBiblicalLabelStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .biblical-label {
      background: rgba(255, 250, 235, 0.72) !important;
      border: 0 !important;
      border-radius: 3px !important;
      box-shadow: none !important;
      white-space: nowrap;
      pointer-events: none;
      padding: 1px 3px !important;
      text-shadow: 0 1px 1px #fff;
    }
    .biblical-label::before { display: none !important; }
    .biblical-label-region {
      color: #7a1f1f !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      letter-spacing: 1px;
    }
    .biblical-label-city {
      color: #3d2c1e !important;
      font-size: 11px !important;
      font-weight: 700 !important;
    }
    .biblical-label-water {
      color: #155e75 !important;
      background: rgba(235, 248, 255, 0.72) !important;
      font-size: 11px !important;
      font-style: italic;
      font-weight: 700 !important;
    }
    .leaflet-control-layers { font-family: system-ui, sans-serif; }
  `;
  document.head.appendChild(style);
}

function removeResultLayers() {
  [guessMarker, answerMarker, answerLine].forEach(layer => {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  });
  guessMarker = answerMarker = answerLine = null;
  selectedLatLng = null;
}

function showQuestion() {
  removeResultLayers();
  const question = dailyQuestions[current];

  $("progress").textContent = `Question ${current + 1} of 7`;
  $("score").textContent = `Score: ${totalScore.toLocaleString()}`;
  $("category").textContent = question.category === "bible" ? "Bible geography" : "Protestant history";
  $("question").textContent = question.question;
  $("instruction").textContent = "Click the map to place your guess, then submit it.";
  $("result").hidden = true;
  $("submitButton").hidden = false;
  $("submitButton").disabled = true;
  $("nextButton").hidden = true;
  $("shareButton").hidden = true;

  map.setView(
    question.category === "bible" ? [32, 35] : [38, -10],
    question.category === "bible" ? 5 : 2,
    { animate: false }
  );
}

function selectGuess(event) {
  selectedLatLng = event.latlng;
  if (guessMarker) {
    guessMarker.setLatLng(selectedLatLng);
  } else {
    guessMarker = L.circleMarker(selectedLatLng, {
      radius: 8,
      color: "#0b5ed7",
      weight: 3,
      fillColor: "#6ea8fe",
      fillOpacity: 0.8
    }).addTo(map);
  }
  $("submitButton").disabled = false;
}

function submitGuess() {
  if (!selectedLatLng) return;

  const question = dailyQuestions[current];
  const answer = { lat: question.lat, lng: question.lng };
  const miles = distanceMiles(selectedLatLng, answer);
  const points = scoreForDistance(miles);

  totalScore += points;
  roundScores.push(points);

  answerMarker = L.circleMarker(answer, {
    radius: 9,
    color: "#8a4b08",
    weight: 3,
    fillColor: "#f2b84b",
    fillOpacity: 0.9
  }).addTo(map).bindPopup(`<strong>${question.answer}</strong>`).openPopup();

  answerLine = L.polyline([selectedLatLng, answer], {
    color: "#b14435",
    weight: 3,
    dashArray: "7 7"
  }).addTo(map);

  map.fitBounds(L.latLngBounds([selectedLatLng, answer]).pad(0.25), { maxZoom: 8 });

  $("result").innerHTML = `<strong>${question.answer}</strong><br>${question.category === "bible" ? "Scripture" : "Figure / topic"}: ${question.reference}<br>${question.note || ""}<br><strong>${Math.round(miles).toLocaleString()} miles away · ${points.toLocaleString()} points</strong>`;
  $("result").hidden = false;
  $("score").textContent = `Score: ${totalScore.toLocaleString()}`;
  $("submitButton").hidden = true;
  $("nextButton").hidden = false;
  $("nextButton").textContent = current === 6 ? "See final score" : "Next question";
  map.off("click", selectGuess);
}

function nextQuestion() {
  current++;
  if (current >= 7) {
    finishGame();
    return;
  }
  map.on("click", selectGuess);
  showQuestion();
}

function showCompletedGame(saved) {
  current = 7;
  totalScore = Number(saved.score) || 0;
  roundScores = Array.isArray(saved.roundScores) ? saved.roundScores : [];
  removeResultLayers();
  map.off("click", selectGuess);

  $("progress").textContent = "Complete";
  $("score").textContent = `Score: ${totalScore.toLocaleString()}`;
  $("category").textContent = "Daily complete";
  $("question").textContent = `Today's score: ${totalScore.toLocaleString()} / 35,000`;
  $("instruction").textContent = "You already completed today's GeoBible. Come back tomorrow for seven new questions.";
  $("result").innerHTML = `<strong>Your saved result</strong><br><span style="font-size:1.5rem;letter-spacing:.12rem">${blocksFor(roundScores)}</span><br>${totalScore.toLocaleString()} / 35,000`;
  $("result").hidden = false;
  $("submitButton").hidden = true;
  $("nextButton").hidden = true;
  $("shareButton").hidden = false;
}

function finishGame() {
  const saved = {
    date: localDateKey(),
    score: totalScore,
    roundScores: [...roundScores],
    completedAt: new Date().toISOString()
  };
  localStorage.setItem("geobible-" + localDateKey(), JSON.stringify(saved));
  showCompletedGame(saved);
}

async function shareResults() {
  const siteUrl = `${window.location.origin}${window.location.pathname}`;
  const text = [
    `GeoBible ${localDateKey()}`,
    blocksFor(roundScores),
    `${totalScore.toLocaleString()} / 35,000`,
    "",
    "Play today's GeoBible:",
    siteUrl
  ].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({ title: "GeoBible Daily", text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("Results and game link copied to your clipboard.");
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      try {
        await navigator.clipboard.writeText(text);
        alert("Results and game link copied to your clipboard.");
      } catch (_) {
        window.prompt("Copy your results and link:", text);
      }
    }
  }
}

async function init() {
  try {
    if (typeof L === "undefined") throw new Error("Leaflet did not load.");

    addBiblicalLabelStyles();
    map = L.map("map", { worldCopyJump: true, minZoom: 2 }).setView([32, 20], 3);

    modernLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
      }
    ).addTo(map);

    createBiblicalLayer().addTo(map);

    L.control.layers(
      { "Modern map": modernLayer },
      { "Biblical names": biblicalLayer },
      { collapsed: false, position: "topright" }
    ).addTo(map);

    const response = await fetch("questions.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`questions.json returned HTTP ${response.status}.`);

    const allQuestions = await response.json();
    if (!Array.isArray(allQuestions) || allQuestions.length < 7) {
      throw new Error("questions.json is invalid.");
    }

    const dateKey = localDateKey();
    $("dateLabel").textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    dailyQuestions = chooseDaily(allQuestions, dateKey);

    const stored = localStorage.getItem("geobible-" + dateKey);
    if (stored) {
      try {
        const saved = JSON.parse(stored);
        if (saved && saved.date === dateKey && Number.isFinite(Number(saved.score))) {
          showCompletedGame(saved);
          return;
        }
      } catch (error) {
        localStorage.removeItem("geobible-" + dateKey);
      }
    }

    map.on("click", selectGuess);
    showQuestion();
  } catch (error) {
    console.error(error);
    $("error").textContent = "The game could not load: " + error.message;
    $("error").hidden = false;
    $("question").textContent = "GeoBible needs attention";
    $("progress").textContent = "Load error";
  }
}

$("submitButton").addEventListener("click", submitGuess);
$("nextButton").addEventListener("click", nextQuestion);
$("shareButton").addEventListener("click", shareResults);
window.addEventListener("DOMContentLoaded", init);
