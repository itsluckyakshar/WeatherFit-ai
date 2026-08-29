// WeatherFit — Multi-Variable Logic & Theme Engine

function getWeatherInfo(code) {
  const table = {
    0: { icon: "☀️", label: "Clear sky", tone: "clear" },
    1: { icon: "🌤️", label: "Mostly clear", tone: "clear" },
    2: { icon: "⛅", label: "Partly cloudy", tone: "cloudy" },
    3: { icon: "☁️", label: "Overcast", tone: "cloudy" },
    45: { icon: "🌫️", label: "Foggy", tone: "fog" },
    48: { icon: "🌫️", label: "Foggy", tone: "fog" },
    51: { icon: "🌦️", label: "Light drizzle", tone: "rain" },
    53: { icon: "🌦️", label: "Drizzle", tone: "rain" },
    55: { icon: "🌦️", label: "Heavy drizzle", tone: "rain" },
    61: { icon: "🌧️", label: "Light rain", tone: "rain" },
    63: { icon: "🌧️", label: "Rain", tone: "rain" },
    65: { icon: "🌧️", label: "Heavy rain", tone: "heavy-rain" },
    71: { icon: "❄️", label: "Light snow", tone: "snow" },
    73: { icon: "❄️", label: "Snow", tone: "snow" },
    75: { icon: "❄️", label: "Heavy snow", tone: "snow" },
    80: { icon: "🌧️", label: "Rain showers", tone: "rain" },
    81: { icon: "🌧️", label: "Rain showers", tone: "rain" },
    82: { icon: "🌧️", label: "Heavy rain showers", tone: "heavy-rain" },
    95: { icon: "⛈️", label: "Thunderstorm", tone: "storm" },
  };
  return table[code] || { icon: "🌡️", label: "Mild", tone: "clear" };
}

function round(n) { return Math.round(Number(n)); }

function hourLabel(dateIso, isNow) {
  if (isNow) return "NOW";
  const d = new Date(dateIso);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return h + " " + ampm;
}

// Location Services
function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject({ message: "This browser can't get your location." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject({ message: err.code === err.PERMISSION_DENIED ? "Location access denied." : "Couldn't fetch location." })
    );
  });
}

async function reverseGeocode(lat, lon) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const res = await fetch(url);
  const data = await res.json();
  const name = data.city || data.locality || data.countryName || "Your location";
  const region = data.principalSubdivision && data.principalSubdivision !== name ? data.principalSubdivision : data.countryName;
  return { name, region: region || "" };
}

async function forwardGeocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results || data.results.length === 0) throw { message: "Couldn't find that city." };
  const r = data.results[0];
  const region = r.admin1 && r.admin1 !== r.name ? r.admin1 : r.country;
  return { name: r.name, region: region || "", latitude: r.latitude, longitude: r.longitude };
}

// Weather Retrieval
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code,uv_index",
    daily: "temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "1",
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) throw { message: "Couldn't fetch weather data." };
  const raw = await res.json();
  return normalizeWeather(raw);
}

function normalizeWeather(raw) {
  const current = raw.current;
  const hourly = raw.hourly;
  const daily = raw.daily;
  const nowIndex = Math.max(0, hourly.time.indexOf(current.time));

  const hourlyForecast = [];
  for (let i = nowIndex; i < hourly.time.length && hourlyForecast.length < 6; i++) {
    hourlyForecast.push({
      time: hourly.time[i],
      isNow: i === nowIndex,
      temperature: round(hourly.temperature_2m[i]),
      precipitationProbability: round(hourly.precipitation_probability[i] || 0),
      weather: getWeatherInfo(hourly.weather_code[i]),
    });
  }

  let minTempAhead = current.temperature_2m;
  let peakRain = { probability: 0, time: null };
  for (let i = nowIndex; i < hourly.time.length; i++) {
    const p = hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0;
    if (p > peakRain.probability) peakRain = { probability: p, time: hourly.time[i] };
    if (hourly.temperature_2m[i] < minTempAhead) minTempAhead = hourly.temperature_2m[i];
  }

  return {
    place: null,
    updatedAt: new Date(),
    current: {
      temperature: round(current.temperature_2m),
      feelsLike: round(current.apparent_temperature),
      humidity: round(current.relative_humidity_2m),
      windSpeed: round(current.wind_speed_10m),
      weather: getWeatherInfo(current.weather_code),
    },
    today: {
      uvMax: daily.uv_index_max ? daily.uv_index_max[0] : 0,
      rainProbabilityMax: daily.precipitation_probability_max ? round(daily.precipitation_probability_max[0]) : peakRain.probability,
      tempMin: round(daily.temperature_2m_min[0]),
    },
    minTempAhead: round(minTempAhead),
    hourlyForecast,
    peakRain,
  };
}

// MULTI-VARIABLE OUTFIT LOGIC ENGINE
function buildRecommendation(weather) {
  const feelsLike = weather.current.feelsLike;
  const tempDelta = weather.current.temperature - weather.minTempAhead;
  const humidity = weather.current.humidity;
  const wind = weather.current.windSpeed;
  const uv = weather.today.uvMax;
  
  const probNow = weather.hourlyForecast[0] ? weather.hourlyForecast[0].precipitationProbability : 0;
  const rainProb = Math.max(probNow, weather.today.rainProbabilityMax);
  const isHeavyRain = weather.current.weather.tone === "heavy-rain" || weather.current.weather.tone === "storm";

  let top = { icon: "👕", name: "T-Shirt" };
  let bottom = { icon: "👖", name: "Jeans" };
  let extra = { icon: "🎒", name: "No extra gear needed" };
  let notes = [];

  if (feelsLike > 28) {
    if (humidity > 70) {
      top = { icon: "👕", name: "Linen Shirt" };
      bottom = { icon: "🩳", name: "Linen Shorts" };
      notes.push("High humidity will trap heat, so lightweight linen is recommended.");
    } else {
      top = { icon: "👕", name: "Cotton T-Shirt" };
      bottom = { icon: "🩳", name: "Breathable Shorts" };
    }
  } else if (feelsLike >= 18) {
    top = { icon: "👕", name: "Casual Polo" };
    bottom = { icon: "👖", name: "Comfortable Chinos" };
  } else if (feelsLike >= 10) {
    top = { icon: "🧶", name: "Knit Sweater" };
    bottom = { icon: "👖", name: "Heavy Denim" };
  } else {
    top = { icon: "🧥", name: "Heavy Winter Coat" };
    bottom = { icon: "👖", name: "Insulated Trousers" };
  }

  let hasLayerWarning = false;
  if (tempDelta >= 5 && feelsLike > 15) {
    extra = { icon: "🧥", name: "Light Jacket (Layer)" };
    notes.push(`Temperatures drop by ${tempDelta}°C later today. Carry a removable outer layer.`);
    hasLayerWarning = true;
  }

  let rainHeadline, rainDetail;
  if (isHeavyRain || rainProb > 60) {
    rainHeadline = "Don't get soaked!";
    rainDetail = `High chance of rain (${rainProb}%). Keep an umbrella in your bag today so you aren't caught off guard.`;
    if (!hasLayerWarning) extra = { icon: "☂️", name: "Sturdy Umbrella" };
    bottom = { icon: "👖", name: "Water-Resistant Trousers" };
  } else if (rainProb >= 30) {
    rainHeadline = "Just in case...";
    rainDetail = weather.peakRain.time 
      ? `Rain might crash your plans around ${hourLabel(weather.peakRain.time, false)} (${rainProb}% chance). Toss a compact umbrella in your backpack.` 
      : `Looking a bit unpredictable today (${rainProb}% chance). A small umbrella won't hurt.`;
    if (!hasLayerWarning) extra = { icon: "☂️", name: "Pocket Umbrella" };
  } else {
    rainHeadline = "Sky looks clear!";
    rainDetail = "Zero umbrella duty today. Enjoy the clear skies while they last!";
  }

  if (uv >= 6 && rainProb < 30 && !hasLayerWarning) {
    extra = { icon: "🕶️", name: "UV-400 Sunglasses" };
    notes.push("High UV index today—sun protection is advised.");
  }

  if (wind > 25) {
    notes.push("Strong winds today; wear wind-blocking outerwear.");
  }

  let briefing = `It's currently ${weather.current.temperature}°C with ${weather.current.weather.label.toLowerCase()}. `;
  briefing += `Wearing a ${top.name.toLowerCase()} with ${bottom.name.toLowerCase()} provides ideal thermal balance. `;
  if (notes.length > 0) briefing += notes.join(" ");

  return {
    top,
    bottom,
    extra,
    rain: { headline: rainHeadline, detail: rainDetail, probability: rainProb, isHeavy: isHeavyRain },
    briefing
  };
}

// Demo Mode — fixed coordinates so each chip reliably shows THAT city's weather,
// not whatever the browser's real geolocation resolves to.
const DEMO_CITIES = {
  Phagwara: { name: "Phagwara", region: "Punjab, India", latitude: 31.2225, longitude: 75.7739 },
  London: { name: "London", region: "United Kingdom", latitude: 51.5074, longitude: -0.1278 },
  Tokyo: { name: "Tokyo", region: "Japan", latitude: 35.6762, longitude: 139.6503 },
  Reykjavik: { name: "Reykjavik", region: "Iceland", latitude: 64.1466, longitude: -21.9426 },
};

async function handleDemoChipClick(chip) {
  const city = chip.getAttribute("data-city");
  const place = DEMO_CITIES[city];
  if (!place) return;

  document.querySelectorAll(".demo-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");

  hideStatus();
  showLoading(`Loading demo weather for ${place.name}...`);
  try {
    const weather = await fetchWeather(place.latitude, place.longitude);
    weather.place = { name: place.name, region: place.region };
    renderWeather(weather);
    hideLoading();
  } catch (err) {
    showStatus((err && err.message) || "Couldn't load demo weather.");
    hideLoading();
  }
}

// DOM Wiring & Event Handlers
const els = {
  useLocationBtn: document.getElementById("useLocationBtn"),
  citySearchForm: document.getElementById("citySearchForm"),
  cityInput: document.getElementById("cityInput"),
  statusBanner: document.getElementById("statusBanner"),
  demoToggleBtn: document.getElementById("demoToggleBtn"),
  demoPanel: document.getElementById("demoPanel"),
  loadingBox: document.getElementById("loadingBox"),
  loadingCaption: document.getElementById("loadingCaption"),
  appContent: document.getElementById("appContent"),
  cityName: document.getElementById("cityName"),
  weatherIconBig: document.getElementById("weatherIconBig"),
  tempBig: document.getElementById("tempBig"),
  conditionLabel: document.getElementById("conditionLabel"),
  statHumidity: document.getElementById("statHumidity"),
  statWind: document.getElementById("statWind"),
  statRain: document.getElementById("statRain"),
  updatedLabel: document.getElementById("updatedLabel"),
  refreshBtn: document.getElementById("refreshBtn"),
  forecastStrip: document.getElementById("forecastStrip"),
  peakRainRibbon: document.getElementById("peakRainRibbon"),
  outfitGrid: document.getElementById("outfitGrid"),
  outfitMascot: document.getElementById("outfitMascot"),
  mascotTip: document.getElementById("mascotTip"),
  rainCheckIcon: document.getElementById("rainCheckIcon"),
  rainCheckTitle: document.getElementById("rainCheckTitle"),
  rainCheckDetail: document.getElementById("rainCheckDetail"),
  rainCheckPercent: document.getElementById("rainCheckPercent"),
  briefingText: document.getElementById("briefingText"),
};

function showStatus(m) { els.statusBanner.textContent = m; els.statusBanner.className = "status-banner visible"; }
function hideStatus() { els.statusBanner.className = "status-banner"; }
function showLoading(c) { els.loadingBox.classList.add("visible"); els.appContent.classList.remove("visible"); els.loadingCaption.textContent = c; }
function hideLoading() { els.loadingBox.classList.remove("visible"); els.appContent.classList.add("visible"); }

async function handleUseLocation() {
  hideStatus();
  els.useLocationBtn.disabled = true;
  showLoading("Fetching location...");
  try {
    const coords = await getBrowserLocation();
    const place = await reverseGeocode(coords.latitude, coords.longitude).catch(() => ({ name: "Your location", region: "" }));
    const weather = await fetchWeather(coords.latitude, coords.longitude);
    weather.place = place;
    renderWeather(weather); hideLoading();
  } catch (err) {
    showStatus((err && err.message) || "Failed to locate. Enter city manually.");
    els.citySearchForm.classList.add("visible"); hideLoading();
  }
  els.useLocationBtn.disabled = false;
}

async function handleCitySearch(e) {
  e.preventDefault();
  const q = els.cityInput.value.trim();
  if (!q) return;
  hideStatus(); showLoading(`Searching for ${q}...`);
  try {
    const place = await forwardGeocode(q);
    const weather = await fetchWeather(place.latitude, place.longitude);
    weather.place = place;
    renderWeather(weather); hideLoading();
  } catch (err) { showStatus((err && err.message) || "City not found."); hideLoading(); }
}

function renderWeather(weather) {
  const rec = buildRecommendation(weather);
  const place = weather.place || { name: "Your location", region: "" };
  els.cityName.textContent = place.region ? `${place.name}, ${place.region}` : place.name;
  els.weatherIconBig.textContent = weather.current.weather.icon;
  els.tempBig.textContent = `${weather.current.temperature}°`;
  els.conditionLabel.textContent = weather.current.weather.label;
  els.statHumidity.textContent = `${weather.current.humidity}%`;
  els.statWind.textContent = `${weather.current.windSpeed} km/h`;
  els.statRain.textContent = `${rec.rain.probability}%`;

  els.forecastStrip.innerHTML = "";
  weather.hourlyForecast.forEach((h) => {
    const item = document.createElement("div");
    item.className = "forecast-item" + (h.isNow ? " is-now" : "");
    item.innerHTML = `
      <div class="forecast-time">${hourLabel(h.time, h.isNow)}</div>
      <div class="forecast-icon">${h.weather.icon}</div>
      <div class="forecast-temp">${h.temperature}°</div>
      <div class="forecast-rain">${h.precipitationProbability}% rain</div>`;
    els.forecastStrip.appendChild(item);
  });

  if (weather.peakRain && weather.peakRain.probability >= 30) {
    els.peakRainRibbon.textContent = `☔ ${weather.peakRain.probability}% chance around ${hourLabel(weather.peakRain.time, false)}`;
    els.peakRainRibbon.classList.add("is-alert");
  } else {
    els.peakRainRibbon.textContent = "☀️ Smooth sailing ahead";
    els.peakRainRibbon.classList.remove("is-alert");
  }

  els.outfitGrid.innerHTML = "";
  [
    { tag: "Top", icon: rec.top.icon, name: rec.top.name },
    { tag: "Bottom", icon: rec.bottom.icon, name: rec.bottom.name },
    { tag: "Extra / Gear", icon: rec.extra.icon, name: rec.extra.name },
  ].forEach((c) => {
    const card = document.createElement("div");
    card.className = "outfit-card";
    card.innerHTML = `<div class="outfit-icon">${c.icon}</div><div class="outfit-tag">${c.tag}</div><div class="outfit-name">${c.name}</div>`;
    els.outfitGrid.appendChild(card);
  });

  els.rainCheckIcon.textContent = rec.rain.isHeavy ? "⛈️" : "☂️";
  els.rainCheckTitle.textContent = rec.rain.headline;
  els.rainCheckDetail.textContent = rec.rain.detail;
  els.rainCheckPercent.textContent = `${rec.rain.probability}%`;
  els.briefingText.textContent = rec.briefing;
  els.updatedLabel.textContent = "Updated just now";
}

// FLOATING THEME SWITCHER INTERACTION
document.querySelectorAll(".theme-dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    document.querySelectorAll(".theme-dot").forEach((d) => d.classList.remove("active"));
    dot.classList.add("active");
    const theme = dot.getAttribute("data-color");
    document.body.setAttribute("data-theme", theme);
  });
});

// FLOATING OUTFIT MASCOT — a bit of fun personality + fills the leftover space
const STYLE_TIPS = [
  "Layer up when it's breezy — easier to peel off than to conjure from nowhere.",
  "Dark colors soak up sun; go light and breathable on hot days.",
  "A cap keeps both UV rays and windblown hair in check.",
  "Rolled-up sleeves are the easiest 5-degree adjustment there is.",
  "Water-resistant shoes are worth it the moment the sky looks moody.",
  "Bring the jacket even if you don't wear it — evenings cool fast.",
];
let mascotHideTimer = null;
els.outfitMascot.addEventListener("click", () => {
  const tip = STYLE_TIPS[Math.floor(Math.random() * STYLE_TIPS.length)];
  els.mascotTip.textContent = tip;
  els.mascotTip.classList.add("visible");
  clearTimeout(mascotHideTimer);
  mascotHideTimer = setTimeout(() => els.mascotTip.classList.remove("visible"), 4500);
});

// Event Listeners
els.useLocationBtn.addEventListener("click", handleUseLocation);
els.citySearchForm.addEventListener("submit", handleCitySearch);
els.demoToggleBtn.addEventListener("click", () => els.demoPanel.classList.toggle("visible"));
document.querySelectorAll(".demo-chip").forEach((chip) => {
  chip.addEventListener("click", () => handleDemoChipClick(chip));
});