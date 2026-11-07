// Open-Meteo 기반 날씨 앱 (API 키 불필요)
const $ = (id) => document.getElementById(id);

const WEATHER = {
  0: ["맑음", "☀️"], 1: ["대체로 맑음", "🌤️"], 2: ["구름 조금", "⛅"], 3: ["흐림", "☁️"],
  45: ["안개", "🌫️"], 48: ["서리 안개", "🌫️"],
  51: ["약한 이슬비", "🌦️"], 53: ["이슬비", "🌦️"], 55: ["강한 이슬비", "🌧️"],
  56: ["어는 이슬비", "🌧️"], 57: ["강한 어는 이슬비", "🌧️"],
  61: ["약한 비", "🌦️"], 63: ["비", "🌧️"], 65: ["강한 비", "🌧️"],
  66: ["어는 비", "🌧️"], 67: ["강한 어는 비", "🌧️"],
  71: ["약한 눈", "🌨️"], 73: ["눈", "🌨️"], 75: ["강한 눈", "❄️"], 77: ["싸락눈", "🌨️"],
  80: ["약한 소나기", "🌦️"], 81: ["소나기", "🌧️"], 82: ["강한 소나기", "⛈️"],
  85: ["약한 눈보라", "🌨️"], 86: ["강한 눈보라", "❄️"],
  95: ["뇌우", "⛈️"], 96: ["우박 동반 뇌우", "⛈️"], 99: ["강한 우박 뇌우", "⛈️"],
};
const wx = (code) => WEATHER[code] || ["알 수 없음", "❔"];
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function setStatus(msg) {
  $("status").textContent = msg;
  $("status").hidden = !msg;
}

// ---- 도시 검색 ----
async function geocode(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=20&language=ko&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("검색 실패");
  const data = await res.json();
  return data.results || [];
}

async function searchCity(name) {
  // 한글 도시명은 "서울"보다 "서울특별시"처럼 정식 명칭으로만 잡히는 경우가 많아 접미사를 붙여 함께 검색
  const queries = [name];
  if (/[가-힣]/.test(name) && !/(시|군|구|도)$/.test(name)) {
    queries.push(name + "시", name + "광역시", name + "특별시");
  }
  const lists = await Promise.all(queries.map(geocode));
  const seen = new Set();
  const all = lists.flat().filter((r) => !seen.has(r.id) && seen.add(r.id));
  // 산·강 등은 제외하고 도시(PPL*)만, 인구 많은 순으로
  const cities = all.filter((r) => (r.feature_code || "").startsWith("PPL"));
  return (cities.length ? cities : all)
    .sort((a, b) => (b.population || 0) - (a.population || 0))
    .slice(0, 5);
}

function showSuggestions(results) {
  const ul = $("suggestions");
  ul.innerHTML = "";
  for (const r of results) {
    const li = document.createElement("li");
    li.textContent = r.name;
    const small = document.createElement("small");
    small.textContent = [r.admin1, r.country].filter(Boolean).join(", ");
    li.appendChild(small);
    li.onclick = () => {
      ul.hidden = true;
      $("search-input").value = r.name;
      loadWeather(r.latitude, r.longitude, r.name, r.country);
    };
    ul.appendChild(li);
  }
  ul.hidden = results.length === 0;
}

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("search-input").value.trim();
  if (!q) return;
  setStatus("검색 중…");
  try {
    const results = await searchCity(q);
    if (results.length === 0) return setStatus(`"${q}"에 해당하는 도시를 찾지 못했어요.`);
    if (results.length === 1) {
      const r = results[0];
      return loadWeather(r.latitude, r.longitude, r.name, r.country);
    }
    setStatus("");
    showSuggestions(results);
  } catch {
    setStatus("검색 중 오류가 발생했어요. 네트워크를 확인해 주세요.");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".top")) $("suggestions").hidden = true;
});

// ---- 현재 위치 ----
$("locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("이 브라우저는 위치 기능을 지원하지 않아요.");
  setStatus("현재 위치를 확인하는 중…");
  navigator.geolocation.getCurrentPosition(
    (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude, "현재 위치", ""),
    () => setStatus("위치 권한이 거부되었어요. 도시를 직접 검색해 주세요.")
  );
});

// ---- 날씨 불러오기 ----
async function loadWeather(lat, lon, name, country) {
  setStatus("날씨 불러오는 중…");
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: 7,
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    render(data, name, country);
    setStatus("");
    try { localStorage.setItem("lastPlace", JSON.stringify({ lat, lon, name, country })); } catch {}
  } catch {
    setStatus("날씨 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

function render(data, name, country) {
  const c = data.current;
  const [desc, icon] = wx(c.weather_code);
  $("place").textContent = country ? `${name}, ${country}` : name;
  $("now-icon").textContent = icon;
  $("now-temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("now-desc").textContent = desc;
  $("now-feels").textContent = `${Math.round(c.apparent_temperature)}°`;
  $("now-humidity").textContent = `${c.relative_humidity_2m}%`;
  $("now-wind").textContent = `${(c.wind_speed_10m / 3.6).toFixed(1)} m/s`;
  $("now-precip").textContent = `${c.precipitation} mm`;

  // 시간별: 현재 시각부터 24시간
  const h = data.hourly;
  const start = Math.max(0, h.time.findIndex((t) => t >= c.time.slice(0, 13)));
  const hourly = $("hourly");
  hourly.innerHTML = "";
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
    const [, hIcon] = wx(h.weather_code[i]);
    const hour = Number(h.time[i].slice(11, 13));
    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${i === start ? "지금" : hour + "시"}</div>
      <div class="h-icon">${hIcon}</div>
      <div>${Math.round(h.temperature_2m[i])}°</div>
      <div class="h-pop">${h.precipitation_probability[i] ?? 0}%</div>`;
    hourly.appendChild(div);
  }

  // 일별
  const d = data.daily;
  const daily = $("daily");
  daily.innerHTML = "";
  d.time.forEach((t, i) => {
    const [dDesc, dIcon] = wx(d.weather_code[i]);
    const date = new Date(t + "T00:00");
    const label = i === 0 ? "오늘" : `${DAYS[date.getDay()]} ${date.getDate()}일`;
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${label}</span>
      <span title="${dDesc}">${dIcon}</span>
      <span class="d-desc">${dDesc}</span>
      <span class="d-pop">💧${d.precipitation_probability_max[i] ?? 0}%</span>
      <span class="d-range"><span class="d-min">${Math.round(d.temperature_2m_min[i])}°</span>${Math.round(d.temperature_2m_max[i])}°</span>`;
    daily.appendChild(li);
  });

  $("current").hidden = false;
  $("hourly-wrap").hidden = false;
  $("daily-wrap").hidden = false;
}

// ---- 시작: 마지막으로 본 장소, 없으면 서울 ----
(function init() {
  let last = null;
  try { last = JSON.parse(localStorage.getItem("lastPlace")); } catch {}
  if (last) loadWeather(last.lat, last.lon, last.name, last.country);
  else loadWeather(37.5665, 126.978, "서울", "대한민국");
})();
