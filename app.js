/* =========================================================
   AI 비서실 통합 관제탑 — app.js (v2)
   3개 뷰: ① 7대 트랙 현황 ② 스킬 단축키 ③ 세컨드 브레인
   - data/status.json · data/skills.json · data/brain.json 을 읽어 그립니다.
   - 체크 상태만 브라우저(localStorage)에 저장됩니다.
   - 공개 저장소 배포를 전제로 하므로 개인정보를 담지 않습니다.
   ========================================================= */
(function () {
  "use strict";

  var STORE_KEY = "execdash.v1.checks";
  var VIEW_KEY = "execdash.v2.view";
  var TRACK_KEY = "execdash.v3.track";
  var TZ = "Asia/Seoul";
  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  var VIEWS = ["tracks", "skills", "brain"];

  var STATUS = {
    active: { label: "가동 중", cls: "ok", icon: "●" },
    waiting: { label: "대기", cls: "wait", icon: "◔" },
    blocked: { label: "확인 필요", cls: "block", icon: "!" },
    paused: { label: "일시정지", cls: "pause", icon: "❚❚" },
    done: { label: "완료", cls: "done", icon: "✓" }
  };

  var CAT_ACCENT = {
    work: "#8b94a7",
    content: "#ff7a9c",
    invest: "#5b8cff",
    realestate: "#43c69a",
    study: "#ff6b5b",
    money: "#3fd0d4",
    prizes: "#ffb347",
    family: "#9d8bff"
  };

  var OWNER_LABEL = { main: "차차차", sub: "Claude Worker", both: "공동" };

  var statusData = null;
  var skillsData = null;
  var brainData = null;

  var state = {
    view: "tracks",
    track: "all",
    role: "all",
    skillCat: "all",
    skillQ: "",
    brainCat: "all",
    brainQ: ""
  };

  var localChecks = readStore();
  var scrollMemo = {};

  /* ---------- 저장소 ---------- */
  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(localChecks));
    } catch (e) {
      /* 저장 공간이 막혀 있어도 화면은 계속 동작합니다. */
    }
  }

  function checkKey(trackId, itemId) {
    return trackId + ":" + itemId;
  }

  function isChecked(track, item) {
    var key = checkKey(track.id, item.id);
    if (Object.prototype.hasOwnProperty.call(localChecks, key)) return !!localChecks[key];
    return !!item.done;
  }

  /* ---------- 시간 ---------- */
  function kstParts(date) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short"
    });
    var out = {};
    fmt.formatToParts(date).forEach(function (p) {
      out[p.type] = p.value;
    });
    if (out.hour === "24") out.hour = "00";
    return out;
  }

  function dayNumber(parts) {
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000;
  }

  function fmtWhen(iso, fallbackLabel) {
    if (!iso) return fallbackLabel || "예정 없음";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return fallbackLabel || iso;
    var t = kstParts(d);
    var now = kstParts(new Date());
    var diff = Math.round(dayNumber(t) - dayNumber(now));
    var hm = t.hour + ":" + t.minute;
    var wd = WEEKDAYS[new Date(Date.UTC(Number(t.year), Number(t.month) - 1, Number(t.day))).getUTCDay()];
    if (diff === 0) return "오늘 " + hm;
    if (diff === 1) return "내일 " + hm;
    if (diff === -1) return "어제 " + hm;
    if (diff > 1 && diff < 7) return Number(t.month) + "/" + Number(t.day) + "(" + wd + ") " + hm;
    if (diff < -1 && diff > -7) return "지난 " + wd + " " + hm;
    return Number(t.month) + "월 " + Number(t.day) + "일(" + wd + ") " + hm;
  }

  function fmtStamp(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var t = kstParts(d);
    return Number(t.month) + "/" + Number(t.day) + " " + t.hour + ":" + t.minute;
  }

  function fmtDay(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00+09:00");
    if (isNaN(d.getTime())) return iso;
    var t = kstParts(d);
    return Number(t.month) + "/" + Number(t.day);
  }

  /* ---------- 유틸 ---------- */
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function el(id) {
    return document.getElementById(id);
  }

  function toast(message) {
    var node = el("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      node.classList.remove("show");
    }, 2100);
  }

  function copyText(text, okMessage, failMessage) {
    var done = function () {
      toast(okMessage || "복사했습니다");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        legacyCopy(text) ? done() : toast(failMessage || "복사가 막혔습니다. 길게 눌러 복사해 주세요.");
      });
    } else if (legacyCopy(text)) {
      done();
    } else {
      toast(failMessage || "복사가 막혔습니다. 길게 눌러 복사해 주세요.");
    }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function hl(text, query) {
    var safe = esc(text);
    var needle = (query || "").trim();
    if (!needle) return safe;
    var hay = safe.toLowerCase();
    var n = esc(needle).toLowerCase();
    if (!n) return safe;
    var out = "";
    var i = 0;
    while (true) {
      var at = hay.indexOf(n, i);
      if (at < 0) {
        out += safe.slice(i);
        break;
      }
      out += safe.slice(i, at) + "<mark>" + safe.substr(at, n.length) + "</mark>";
      i = at + n.length;
    }
    return out;
  }

  /* =========================================================
     ① 7대 트랙 — 집계
     ========================================================= */
  function itemsFor(track) {
    if (state.role === "all") return track.checklist.slice();
    return track.checklist.filter(function (item) {
      return (item.role || "main") === state.role;
    });
  }

  function statsFor(track) {
    var items = itemsFor(track);
    var done = items.filter(function (item) {
      return isChecked(track, item);
    }).length;
    return { total: items.length, done: done, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
  }

  function totals() {
    var sum = { done: 0, total: 0 };
    statusData.tracks.forEach(function (track) {
      var s = statsFor(track);
      sum.done += s.done;
      sum.total += s.total;
    });
    sum.pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
    return sum;
  }

  function countByStatus() {
    var out = { active: 0, waiting: 0, blocked: 0, paused: 0, done: 0 };
    statusData.tracks.forEach(function (t) {
      if (out[t.status] != null) out[t.status] += 1;
    });
    return out;
  }

  function trackById(id) {
    if (!statusData) return null;
    for (var i = 0; i < statusData.tracks.length; i++) {
      if (statusData.tracks[i].id === id) return statusData.tracks[i];
    }
    return null;
  }

  /* =========================================================
     헤더 · 탭
     ========================================================= */
  function renderHeader() {
    if (statusData) {
      el("app-title").textContent = statusData.meta.title || "AI 비서실 통합 관제탑";
      el("app-sub").textContent = statusData.meta.subtitle || "";
      el("sync-time").textContent = fmtStamp(statusData.meta.generated_at);
      el("privacy-note").textContent = statusData.meta.privacy_notice || "";
      el("foot-build").textContent = "status.json · " + fmtStamp(statusData.meta.generated_at);
    }
  }

  function renderRoles() {
    if (!statusData) return;
    var host = el("roles");
    host.innerHTML = ["main", "sub"]
      .map(function (key) {
        var r = statusData.roles[key] || {};
        return (
          '<div class="role ' + key + '">' +
          '<span class="role-badge">' + esc(r.kind || key) + "</span>" +
          '<span class="role-name">' + esc(r.name || "") + "</span>" +
          '<span class="role-desc">' + esc(r.summary || "") + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderTabCounts() {
    el("tab-count-tracks").textContent = statusData ? statusData.tracks.length : "—";
    el("tab-count-skills").textContent = skillsData ? skillsData.skills.length : "—";
    el("tab-count-brain").textContent = brainData ? brainData.entries.length : "—";
  }

  function setView(name, opts) {
    if (VIEWS.indexOf(name) < 0) name = "tracks";
    opts = opts || {};
    if (state.view !== name) scrollMemo[state.view] = window.scrollY;

    state.view = name;
    VIEWS.forEach(function (v) {
      var panel = el("view-" + v);
      var tab = el("tab-" + v);
      var on = v === name;
      if (panel) panel.hidden = !on;
      if (tab) {
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
        tab.classList.toggle("active", on);
      }
    });

    try {
      localStorage.setItem(VIEW_KEY, name);
    } catch (e) {
      /* 무시 */
    }
    if (history.replaceState) {
      history.replaceState(null, "", "#" + name + (name === "tracks" && state.track !== "all" ? "/" + state.track : ""));
    }

    if (opts.scroll !== false) {
      var y = scrollMemo[name] || 0;
      window.scrollTo({ top: y, behavior: "auto" });
    }
    if (name === "skills" && skillsData) renderSkills();
    if (name === "brain" && brainData) renderBrain();
  }

  /* =========================================================
     ① 7대 트랙 — 진행률·필터·카드
     ========================================================= */
  function renderProgress() {
    if (!statusData) return;
    var t = totals();
    el("overall-pct").textContent = t.pct + "%";
    el("overall-bar").style.width = t.pct + "%";
    el("overall-bar-wrap").setAttribute("aria-valuenow", String(t.pct));

    var c = countByStatus();
    var roleName = state.role === "all" ? "전체 담당" : (statusData.roles[state.role] || {}).name || state.role;
    var parts = [roleName, "체크 " + t.done + "/" + t.total + "항목", "가동 " + c.active, "대기 " + c.waiting];
    if (c.blocked) parts.push("확인 필요 " + c.blocked);
    el("overall-title").textContent =
      state.track === "all" ? "전체 진행률" : (trackById(state.track) || {}).name + " 진행률";
    el("overall-meta").textContent = parts.join(" · ");
  }

  function statusMeta(track) {
    return STATUS[track.status] || { label: track.status || "—", cls: "pause", icon: "•" };
  }

  function trackFacts(track) {
    return {
      items: (track.tracking_items || []).length,
      open: (track.open_questions || []).length
    };
  }

  /* 트랙 선택 버튼 — 가로 스크롤 없이 7개(+전체)가 전부 보이는 그리드 */
  function renderPicker() {
    if (!statusData) return;
    var host = el("track-filters");
    if (!host) return;
    var total = totals();
    var chips = [
      {
        id: "all",
        icon: "◎",
        name: "전체 보기",
        meta: statusData.tracks.length + "개 트랙 · 체크 " + total.done + "/" + total.total,
        tone: "info",
        accent: "#9fb6ff"
      }
    ].concat(
      statusData.tracks.map(function (t) {
        var f = trackFacts(t);
        var s = statusMeta(t);
        return {
          id: t.id,
          icon: t.icon,
          name: t.name,
          meta: s.label + " · 추적 " + f.items + "건",
          tone: s.cls,
          accent: t.accent || "#5b8cff"
        };
      })
    );

    host.innerHTML = chips
      .map(function (c) {
        var on = state.track === c.id;
        return (
          '<button type="button" class="tbtn' + (on ? " is-active" : "") + '"' +
          ' role="tab" data-track="' + esc(c.id) + '" aria-selected="' + (on ? "true" : "false") + '"' +
          ' style="--accent:' + esc(c.accent) + '">' +
            '<span class="tbtn-ico" aria-hidden="true">' + esc(c.icon) + "</span>" +
            '<span class="tbtn-text">' +
              '<span class="tbtn-name">' + esc(c.name) + "</span>" +
              '<span class="tbtn-meta"><i class="dot ' + esc(c.tone) + '" aria-hidden="true"></i>' + esc(c.meta) + "</span>" +
            "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function renderFilters() {
    renderPicker();
  }

  function setTrack(id, opts) {
    opts = opts || {};
    if (id !== "all" && !trackById(id)) id = "all";
    state.track = id;
    if (id === "all") state.role = "all";
    try {
      localStorage.setItem(TRACK_KEY, id);
    } catch (e) {
      /* 무시 */
    }
    renderPicker();
    renderProgress();
    renderAlerts();
    renderTracks();
    if (history.replaceState) {
      var hash = "#" + state.view + (state.view === "tracks" && id !== "all" ? "/" + id : "");
      history.replaceState(null, "", hash);
    }
    if (id !== "all" && opts.scroll !== false) {
      var host = el("track-detail");
      if (host) host.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setRole(id) {
    state.role = id;
    renderProgress();
    renderTracks();
  }

  function renderRoleChips() {
    var roles = [{ id: "all", label: "담당 전체" }];
    ["main", "sub"].forEach(function (key) {
      var r = (statusData.roles || {})[key] || {};
      roles.push({ id: key, label: r.name || key });
    });
    return (
      '<div class="chip-row chip-row-role" role="group" aria-label="담당 선택">' +
      roles
        .map(function (r) {
          var on = state.role === r.id;
          return (
            '<button type="button" class="chip" data-role="' + esc(r.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
            esc(r.label) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function badge(status) {
    var s = STATUS[status] || { label: status || "—", cls: "pause" };
    return '<span class="badge ' + s.cls + '">' + esc(s.label) + "</span>";
  }

  function renderRunBox(kind, run) {
    var label = kind === "next" ? "다음 스케줄" : "최근 실행";
    var when = fmtWhen(run && run.at, run && run.at ? null : (run && run.label));
    var showWhat = run && run.at && run.label ? run.label : "";
    return (
      '<div class="run-box ' + kind + '">' +
      '<div class="run-label">' + label + "</div>" +
      '<div class="run-time">' + esc(when) + "</div>" +
      (showWhat ? '<div class="run-what">' + esc(showWhat) + "</div>" : "") +
      "</div>"
    );
  }

  function renderOwners(track) {
    var out = [];
    ["main", "sub"].forEach(function (key) {
      var list = (track.owners || {})[key] || [];
      if (!list.length) return;
      var role = (statusData.roles || {})[key] || {};
      out.push(
        '<div class="owner ' + key + '">' +
          "<h4>" + esc(role.name || key) + "</h4>" +
          "<ul>" + list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
        "</div>"
      );
    });
    return out.length ? '<div class="owners">' + out.join("") + "</div>" : "";
  }

  function renderChecks(track) {
    var items = itemsFor(track);
    if (!items.length) {
      return '<p class="card-note">이 담당의 체크 항목이 아직 없습니다.</p>';
    }
    var roleLabel = function (role) {
      if (state.role !== "all") return "";
      if (role !== "sub") return "";
      var r = (statusData.roles || {}).sub || {};
      return '<span class="role-pill">' + esc(r.kind || "Sub") + "</span>";
    };
    return (
      '<ul class="checks">' +
      items.map(function (item) {
        var checked = isChecked(track, item);
        var role = item.role || "main";
        return (
          "<li>" +
          '<label class="check' + (checked ? " done" : "") + '">' +
          '<input type="checkbox" data-check="' + esc(track.id + ":" + item.id) + '"' +
          (checked ? " checked" : "") + ">" +
          '<span class="check-text">' + esc(item.text) + "</span>" +
          roleLabel(role) +
          "</label>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderLinks(track) {
    var links = track.links || [];
    if (!links.length) return "";
    return (
      '<div class="section"><h3 class="section-title">바로가기</h3><div class="links">' +
      links
        .map(function (l) {
          return '<a class="link-btn" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + "</a>";
        })
        .join("") +
      "</div></div>"
    );
  }

  function renderCommands(track) {
    var cmd = track.commands || {};
    if (!cmd.main && !cmd.sub) return "";
    var mainName = ((statusData.roles || {}).main || {}).name || "차차차";
    var subName = ((statusData.roles || {}).sub || {}).name || "클로드 워커";
    var out = [];

    if (cmd.main) {
      out.push(
        '<button type="button" class="cmd-btn" data-cmd="' + esc(track.id) + ':main">' +
          '<span class="cmd-ico" aria-hidden="true">▶</span>' +
          '<span class="cmd-who">' + esc(mainName) + "</span>" +
          "<span>실행 명령</span>" +
          '<span class="cmd-tail">복사 ⧉</span>' +
        "</button>"
      );
    }
    if (cmd.sub) {
      out.push(
        '<button type="button" class="cmd-btn sub" data-cmd="' + esc(track.id) + ':sub">' +
          '<span class="cmd-ico" aria-hidden="true">⚙</span>' +
          '<span class="cmd-who">' + esc(subName) + "</span>" +
          "<span>작업 지시</span>" +
          '<span class="cmd-tail">복사 ⧉</span>' +
        "</button>"
      );
    }
    var preview = cmd.main || cmd.sub || "";
    return (
      '<div class="section"><h3 class="section-title">실행</h3><div class="cmd-row">' +
      out.join("") +
      '<p class="cmd-preview" data-preview="' + esc(track.id) + '">' + esc(preview) + "</p>" +
      "</div></div>"
    );
  }

  function renderOverviewCard(track) {
    var s = statsFor(track);
    var f = trackFacts(track);
    var st = statusMeta(track);
    var items = (track.tracking_items || []).slice(0, 3);
    var nxt = fmtWhen(track.next_run && track.next_run.at, track.next_run && track.next_run.label);
    return (
      '<article class="ov-card" data-open="' + esc(track.id) + '"' +
        ' style="--accent:' + esc(track.accent || "#5b8cff") + '"' +
        ' tabindex="0" role="button" aria-label="' + esc(track.name) + ' 상세 보기">' +
        '<div class="ov-head">' +
          '<span class="ov-ico" aria-hidden="true">' + esc(track.icon) + "</span>" +
          '<div class="ov-titles">' +
            '<h3 class="ov-name"><span class="card-no">' + esc(track.no) + "</span>" + esc(track.name) + "</h3>" +
            '<p class="ov-tag">' + esc(track.tagline || "") + "</p>" +
          "</div>" +
          '<span class="badge ' + st.cls + '">' + esc(st.label) + "</span>" +
        "</div>" +
        '<p class="ov-summary">' + esc(track.summary || "") + "</p>" +
        '<ul class="ov-list">' +
          items
            .map(function (i) {
              return (
                '<li><i class="dot ' + esc(i.tone || "info") + '" aria-hidden="true"></i>' +
                '<span class="ov-list-name">' + esc(i.title) + "</span>" +
                '<span class="ov-list-state">' + esc(i.status) + "</span></li>"
              );
            })
            .join("") +
          (f.items > items.length ? '<li class="ov-more">외 ' + (f.items - items.length) + "건 더 추적 중</li>" : "") +
        "</ul>" +
        '<div class="ov-foot">' +
          '<span class="ov-next">다음 ' + esc(nxt) + "</span>" +
          '<span class="ov-counts">추적 ' + f.items + " · 미결 " + f.open + "</span>" +
        "</div>" +
        '<div class="ov-bar"><span style="width:' + (s.pct || 0) + '%" data-fill-for="' + esc(track.id) + '"></span></div>' +
        '<span class="ov-cta">상세 보기 <span aria-hidden="true">→</span></span>' +
      "</article>"
    );
  }

  function renderTItem(item) {
    return (
      '<li class="titem tone-' + esc(item.tone || "info") + '">' +
        '<div class="titem-top">' +
          '<span class="titem-kind">' + esc(item.kind || "항목") + "</span>" +
          '<h4 class="titem-title">' + esc(item.title) + "</h4>" +
          '<span class="titem-state">' + esc(item.status) + "</span>" +
        "</div>" +
        (item.detail ? '<p class="titem-detail">' + esc(item.detail) + "</p>" : "") +
        (item.criteria ? '<p class="titem-crit"><span>기준</span>' + esc(item.criteria) + "</p>" : "") +
        (item.next ? '<p class="titem-next"><span>다음</span>' + esc(item.next) + "</p>" : "") +
      "</li>"
    );
  }

  function whoLabel(who) {
    if (who === "user") return "내 확인";
    if (who === "sub") return "워커";
    return "차차차";
  }

  function renderDetail(track) {
    var s = statsFor(track);
    var f = trackFacts(track);
    var st = statusMeta(track);
    var items = track.tracking_items || [];
    var qs = track.open_questions || [];
    var meter = "";
    if (track.meter) {
      var mPct = track.meter.max ? Math.round((track.meter.value / track.meter.max) * 100) : 0;
      meter =
        '<div class="detail-meter">' +
          "<span>" + esc(track.meter.label) + "</span>" +
          "<strong>" + esc(track.meter.value) + " / " + esc(track.meter.max) + " " + esc(track.meter.unit || "") + "</strong>" +
          '<div class="bar"><div class="bar-fill" style="width:' + Math.max(mPct, 2) + '%"></div></div>' +
        "</div>";
    }

    return (
      '<article class="detail" data-card="' + esc(track.id) + '" style="--accent:' + esc(track.accent || "#5b8cff") + '">' +
        '<header class="detail-head">' +
          '<button type="button" class="back-btn" data-back>← 전체 보기</button>' +
          '<div class="detail-title">' +
            '<span class="detail-ico" aria-hidden="true">' + esc(track.icon) + "</span>" +
            '<div class="detail-titles">' +
              '<h2 class="detail-name"><span class="card-no">' + esc(track.no) + "</span>" + esc(track.name) + "</h2>" +
              '<p class="detail-tag">' + esc(track.tagline || "") + "</p>" +
            "</div>" +
            '<span class="badge ' + st.cls + '">' + esc(st.label) + "</span>" +
          "</div>" +
          '<p class="detail-summary">' + esc(track.summary || "") + "</p>" +
          '<div class="dstats">' +
            '<div class="dstat"><span>체크</span><strong data-count-for="' + esc(track.id) + '">' + s.done + " / " + s.total + " · " + s.pct + '%</strong></div>' +
            '<div class="dstat"><span>추적 항목</span><strong>' + f.items + "</strong></div>" +
            '<div class="dstat"><span>미결</span><strong>' + f.open + "</strong></div>" +
            '<div class="dstat"><span>다음 실행</span><strong>' + esc(fmtWhen(track.next_run && track.next_run.at, track.next_run && track.next_run.label)) + "</strong></div>" +
          "</div>" +
          '<div class="detail-bar"><span style="width:' + (s.pct || 0) + '%" data-fill-for="' + esc(track.id) + '"></span></div>' +
          meter +
          renderRoleChips() +
        "</header>" +
        '<div class="detail-cols">' +
          '<div class="detail-main">' +
            '<section class="dsec">' +
              '<h3 class="dsec-title">🎯 추적 중인 대상 <span class="dsec-count">' + items.length + "</span></h3>" +
              (items.length
                ? '<ul class="titems">' + items.map(renderTItem).join("") + "</ul>"
                : '<p class="dsec-empty">등록된 추적 항목이 없습니다.</p>') +
            "</section>" +
            '<section class="dsec">' +
              '<h3 class="dsec-title">⏳ 미결 확인 사항 <span class="dsec-count">' + qs.length + "</span></h3>" +
              (qs.length
                ? '<ul class="qlist">' +
                  qs
                    .map(function (q) {
                      return (
                        '<li class="qitem">' +
                          '<span class="q-who">' + esc(whoLabel(q.who)) + "</span>" +
                          '<span class="q-text">' + esc(q.text) + "</span>" +
                          (q.due ? '<span class="q-due">' + esc(q.due) + "</span>" : "") +
                        "</li>"
                      );
                    })
                    .join("") +
                  "</ul>"
                : '<p class="dsec-empty">미결 항목이 없습니다.</p>') +
            "</section>" +
            '<section class="dsec">' +
              '<h3 class="dsec-title">✅ 진행 체크 <span class="dsec-count">' + s.done + "/" + s.total + "</span></h3>" +
              renderChecks(track) +
            "</section>" +
          "</div>" +
          '<aside class="detail-side">' +
            '<section class="dsec">' +
              '<h3 class="dsec-title">🕒 실행 기록</h3>' +
              '<div class="runs">' + renderRunBox("next", track.next_run) + renderRunBox("last", track.last_run) + "</div>" +
            "</section>" +
            '<section class="dsec">' +
              '<h3 class="dsec-title">🗓️ 스케줄</h3>' +
              '<ul class="sched">' +
                (track.schedule || [])
                  .map(function (row) {
                    return '<li><span class="when">' + esc(row.when) + '</span><span class="what">' + esc(row.what) + "</span></li>";
                  })
                  .join("") +
              "</ul>" +
            "</section>" +
            '<section class="dsec">' +
              '<h3 class="dsec-title">👥 담당 분담</h3>' +
              renderOwners(track) +
            "</section>" +
            renderCommands(track) +
            renderLinks(track) +
            (track.note ? '<p class="card-note">' + esc(track.note) + "</p>" : "") +
          "</aside>" +
        "</div>" +
      "</article>"
    );
  }

  function renderTracks() {
    if (!statusData) return;
    var ovHost = el("track-overview");
    var dtHost = el("track-detail");
    if (!ovHost || !dtHost) return;
    if (state.track === "all") {
      ovHost.hidden = false;
      ovHost.innerHTML = statusData.tracks.map(renderOverviewCard).join("");
      dtHost.hidden = true;
      dtHost.innerHTML = "";
    } else {
      var track = trackById(state.track);
      ovHost.hidden = true;
      ovHost.innerHTML = "";
      dtHost.hidden = false;
      dtHost.innerHTML = track ? renderDetail(track) : "";
    }
    el("empty").hidden = uiListLength() > 0;
  }

  function uiListLength() {
    if (!statusData) return 0;
    return state.track === "all" ? statusData.tracks.length : (trackById(state.track) ? 1 : 0);
  }

  function refreshCounts(trackId) {
    var track = trackById(trackId);
    if (!track) return;
    var s = statsFor(track);
    Array.prototype.forEach.call(document.querySelectorAll('[data-count-for="' + trackId + '"]'), function (node) {
      node.textContent = s.done + " / " + s.total + " · " + s.pct + "%";
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill-for="' + trackId + '"]'), function (node) {
      node.style.width = (s.pct || 0) + "%";
    });
  }

  function renderAlerts() {
    var host = el("alerts");
    if (!statusData) return;
    var alerts = (statusData.alerts || []).filter(function (a) {
      return state.track === "all" || a.track === state.track;
    });
    if (!alerts.length) {
      host.innerHTML = "";
      return;
    }
    var warnCount = alerts.filter(function (a) { return a.level === "warn"; }).length;
    var infoCount = alerts.length - warnCount;
    var summary = [];
    if (warnCount) summary.push("확인 필요 " + warnCount);
    if (infoCount) summary.push("참고 " + infoCount);

    if (alerts._open == null) alerts._open = window.innerWidth > 720;

    host.innerHTML =
      '<div class="alerts-head">' +
        '<span class="alerts-dot" aria-hidden="true">' + (warnCount ? "⚠️" : "ℹ️") + "</span>" +
        "<strong>" + esc(summary.join(" · ")) + "</strong>" +
        '<button type="button" class="alerts-toggle" data-alerts-toggle aria-expanded="' +
          (alerts._open ? "true" : "false") + '">' + (alerts._open ? "접기" : "펼쳐 보기") + "</button>" +
      "</div>" +
      '<div class="alerts-body"' + (alerts._open ? "" : " hidden") + ">" +
      alerts.map(function (a) {
        var track = trackById(a.track);
        var icon = a.level === "warn" ? "⚠️" : "ℹ️";
        return (
          '<div class="alert ' + esc(a.level || "info") + '">' +
            '<span class="alert-icon" aria-hidden="true">' + icon + "</span>" +
            '<div class="alert-body">' +
              '<p class="alert-title">' + esc(a.title) + "</p>" +
              '<p class="alert-text">' + esc(a.text) + "</p>" +
              (track
                ? '<button type="button" class="alert-link" data-jump="' + esc(track.id) + '">' + esc(track.icon + " " + track.name) + " 트랙 열기 →</button>"
                : "") +
            "</div>" +
          "</div>"
        );
      }).join("") +
      "</div>";
  }

  function renderTrackView() {
    renderRoles();
    renderFilters();
    renderProgress();
    renderAlerts();
    renderTracks();
  }

  /* =========================================================
     ② 스킬 단축키
     ========================================================= */
  function skillMatches(skill, query) {
    if (!query) return true;
    var blob = [
      skill.name,
      skill.tagline,
      skill.when,
      (skill.inputs || []).join(" "),
      (skill.steps || []).join(" "),
      skill.output,
      skill.note,
      skill.command,
      skill.doc
    ].join(" ").toLowerCase();
    return blob.indexOf(query.toLowerCase()) >= 0;
  }

  function renderSkillFilters() {
    if (!skillsData) return;
    var cats = skillsData.meta.categories || [];
    var counts = {};
    skillsData.skills.forEach(function (s) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    });
    var chips = [{ id: "all", icon: "◎", label: "전체", count: skillsData.skills.length }].concat(
      cats.map(function (c) {
        return { id: c.id, icon: c.icon, label: c.label, count: counts[c.id] || 0 };
      })
    );
    el("skill-filters").innerHTML = chips
      .map(function (c) {
        var on = state.skillCat === c.id;
        return (
          '<button type="button" class="chip" data-skill-cat="' + esc(c.id) + '"' +
          ' aria-pressed="' + (on ? "true" : "false") + '">' +
          '<span aria-hidden="true">' + esc(c.icon) + "</span>" + esc(c.label) +
          (c.count ? '<span class="chip-count">' + c.count + "</span>" : "") +
          "</button>"
        );
      })
      .join("");
  }

  function renderSkills() {
    if (!skillsData) return;
    var host = el("skills");
    var q = state.skillQ.trim();
    var list = skillsData.skills.filter(function (s) {
      if (state.skillCat !== "all" && s.category !== state.skillCat) return false;
      return skillMatches(s, q);
    });

    host.innerHTML = list
      .map(function (s) {
        var accent = CAT_ACCENT[s.category] || "#5b8cff";
        var owner = s.owner || "main";
        var ownerLabel = OWNER_LABEL[owner] || owner;
        return (
          '<article class="skill" data-skill-card="' + esc(s.id) + '" style="--accent:' + esc(accent) + '">' +
            '<div class="skill-head">' +
              '<span class="skill-ico" aria-hidden="true">' + esc(s.icon) + "</span>" +
              '<div class="skill-titles">' +
                '<h3 class="skill-name">' + hl(s.name, q) + "</h3>" +
                '<p class="skill-tagline">' + hl(s.tagline, q) + "</p>" +
              "</div>" +
              '<span class="owner-pill ' + esc(owner) + '">' + esc(ownerLabel) + "</span>" +
            "</div>" +
            (s.when ? '<p class="skill-when"><span>언제</span>' + hl(s.when, q) + "</p>" : "") +
            (s.steps && s.steps.length
              ? '<ol class="skill-steps">' + s.steps.map(function (x) { return "<li>" + hl(x, q) + "</li>"; }).join("") + "</ol>"
              : "") +
            '<div class="skill-io">' +
              '<div class="skill-io-row"><span class="skill-io-k">참고</span>' +
                '<div class="skill-io-v">' +
                  (s.inputs || []).map(function (x) { return '<code class="path">' + hl(x, q) + "</code>"; }).join("") +
                "</div>" +
              "</div>" +
              (s.output
                ? '<div class="skill-io-row"><span class="skill-io-k">출력</span><div class="skill-io-v"><span class="skill-out">' + hl(s.output, q) + "</span></div></div>"
                : "") +
            "</div>" +
            (s.note ? '<p class="skill-note">⚠ ' + hl(s.note, q) + "</p>" : "") +
            '<div class="skill-actions">' +
              '<button type="button" class="cmd-btn" data-skill-copy="' + esc(s.id) + '">' +
                '<span class="cmd-ico" aria-hidden="true">▶</span>' +
                "<span>실행 명령 복사</span>" +
                '<span class="cmd-tail">복사 ⧉</span>' +
              "</button>" +
              (s.doc
                ? '<button type="button" class="btn-mini" data-skill-doc="' + esc(s.id) + '">규칙 문서 경로</button>'
                : "") +
            "</div>" +
            '<p class="cmd-preview" data-skill-preview="' + esc(s.id) + '">' + esc(s.command || "") + "</p>" +
          "</article>"
        );
      })
      .join("");

    el("skills-empty").hidden = list.length > 0;
    el("skills-fallback").hidden = true;
  }

  function setSkillCat(id) {
    state.skillCat = id;
    renderSkillFilters();
    renderSkills();
  }

  function setSkillQuery(q) {
    state.skillQ = q;
    el("skill-clear").hidden = !q;
    renderSkills();
  }

  /* =========================================================
     ③ 세컨드 브레인
     ========================================================= */
  function brainMatches(entry, query) {
    if (!query) return true;
    var blob = [entry.title, entry.summary, entry.path, entry.type, (entry.tags || []).join(" ")].join(" ").toLowerCase();
    return blob.indexOf(query.toLowerCase()) >= 0;
  }

  function renderBrainFilters() {
    if (!brainData) return;
    var cats = brainData.meta.categories || [];
    var counts = {};
    brainData.entries.forEach(function (e) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    });
    var chips = [{ id: "all", icon: "◎", label: "전체", count: brainData.entries.length }].concat(
      cats.map(function (c) {
        return { id: c.id, icon: c.icon, label: c.label, count: counts[c.id] || 0 };
      })
    );
    el("brain-filters").innerHTML = chips
      .map(function (c) {
        var on = state.brainCat === c.id;
        return (
          '<button type="button" class="chip" data-brain-cat="' + esc(c.id) + '"' +
          ' aria-pressed="' + (on ? "true" : "false") + '">' +
          '<span aria-hidden="true">' + esc(c.icon) + "</span>" + esc(c.label) +
          (c.count ? '<span class="chip-count">' + c.count + "</span>" : "") +
          "</button>"
        );
      })
      .join("");
  }

  function renderBrain() {
    if (!brainData) return;
    var q = state.brainQ.trim();
    var list = brainData.entries
      .filter(function (e) {
        if (state.brainCat !== "all" && e.category !== state.brainCat) return false;
        return brainMatches(e, q);
      })
      .sort(function (a, b) {
        return String(b.updated || "").localeCompare(String(a.updated || ""));
      });

    el("brain-count").textContent = list.length + "개 항목";
    el("brain-intro").textContent = brainData.meta.intro || el("brain-intro").textContent;

    el("brain").innerHTML = list
      .map(function (e) {
        var accent = CAT_ACCENT[e.category] || "#5b8cff";
        var link = "";
        if (e.url) {
          link = '<a class="brain-link" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">열기 ↗</a>';
        } else if (e.private_link) {
          link = '<span class="brain-lock" title="주소는 비공개 인덱스에 있습니다">🔒 주소 비공개</span>';
        } else if (e.private) {
          link = '<span class="brain-lock" title="파일은 개인 PC·드라이브에만 있습니다">🔒 비공개 경로</span>';
        }
        return (
          '<article class="brain-item" data-brain-item="' + esc(e.id) + '" data-cat="' + esc(e.category) + '"' +
            ' style="--accent:' + esc(accent) + '" tabindex="0" role="button" aria-expanded="false">' +
            '<div class="brain-head">' +
              '<span class="brain-ico" aria-hidden="true">' + esc(e.icon || "📄") + "</span>" +
              '<div class="brain-titles">' +
                '<h3 class="brain-title">' + hl(e.title, q) + "</h3>" +
                '<p class="brain-path"><code>' + hl(e.path, q) + "</code></p>" +
              "</div>" +
              '<span class="type-badge">' + hl(e.type, q) + "</span>" +
            "</div>" +
            '<p class="brain-summary">' + hl(e.summary, q) + "</p>" +
            '<div class="brain-foot">' +
              '<span class="brain-tags">' +
                (e.tags || []).slice(0, 4).map(function (t) { return "<span>#" + hl(t, q) + "</span>"; }).join("") +
              "</span>" +
              '<span class="brain-meta">' +
                (link ? link + '<span class="dot">·</span>' : "") +
                '<span class="brain-updated">' + esc(fmtDay(e.updated)) + "</span>" +
                '<button type="button" class="btn-mini" data-copy-path="' + esc(e.id) + '">경로 복사</button>' +
              "</span>" +
            "</div>" +
          "</article>"
        );
      })
      .join("");

    el("brain-empty").hidden = list.length > 0;
    el("brain-fallback").hidden = true;
  }

  function setBrainCat(id) {
    state.brainCat = id;
    renderBrainFilters();
    renderBrain();
  }

  function setBrainQuery(q) {
    state.brainQ = q;
    el("brain-clear").hidden = !q;
    renderBrain();
  }

  function brainById(id) {
    if (!brainData) return null;
    for (var i = 0; i < brainData.entries.length; i++) {
      if (brainData.entries[i].id === id) return brainData.entries[i];
    }
    return null;
  }

  /* =========================================================
     이벤트
     ========================================================= */
  function bindDelegates() {
    document.addEventListener("click", function (event) {
      var target = event.target.closest(
        "[data-view],[data-track],[data-role],[data-cmd],[data-jump],[data-alerts-toggle]," +
        "[data-open],[data-back]," +
        "[data-skill-copy],[data-skill-doc],[data-skill-cat],[data-brain-cat],[data-copy-path]," +
        "[data-brain-item],#reset-checks"
      );
      if (!target) return;

      if (target.hasAttribute("data-view")) {
        setView(target.getAttribute("data-view"));
        return;
      }

      if (target.hasAttribute("data-alerts-toggle")) {
        var body = document.querySelector(".alerts-body");
        if (body) {
          var open = body.hidden;
          body.hidden = !open;
          target.setAttribute("aria-expanded", open ? "true" : "false");
          target.textContent = open ? "접기" : "펼쳐 보기";
        }
        return;
      }

      if (target.id === "reset-checks") {
        localChecks = {};
        writeStore();
        renderTrackView();
        toast("내 체크를 초기화했습니다");
        return;
      }
      if (target.hasAttribute("data-back")) {
        setTrack("all");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (target.hasAttribute("data-open")) {
        setView("tracks");
        setTrack(target.getAttribute("data-open"));
        return;
      }
      if (target.hasAttribute("data-track")) {
        setTrack(target.getAttribute("data-track"));
        return;
      }
      if (target.hasAttribute("data-role")) {
        setRole(target.getAttribute("data-role"));
        return;
      }
      if (target.hasAttribute("data-jump")) {
        setView("tracks");
        setTrack(target.getAttribute("data-jump"));
        return;
      }
      if (target.hasAttribute("data-cmd")) {
        var parts = target.getAttribute("data-cmd").split(":");
        var track = trackById(parts[0]);
        if (!track) return;
        var kind = parts[1];
        var text = (track.commands || {})[kind];
        if (!text) return;
        copyText(text, (kind === "main" ? "실행 명령" : "작업 지시") + "을 복사했습니다");
        var preview = document.querySelector('[data-preview="' + track.id + '"]');
        if (preview) {
          preview.textContent = text;
          preview.classList.add("open");
        }
        return;
      }

      if (target.hasAttribute("data-skill-cat")) {
        setSkillCat(target.getAttribute("data-skill-cat"));
        return;
      }
      if (target.hasAttribute("data-skill-copy")) {
        var id = target.getAttribute("data-skill-copy");
        var skill = null;
        (skillsData.skills || []).forEach(function (s) { if (s.id === id) skill = s; });
        if (!skill) return;
        copyText(skill.command, "실행 명령을 복사했습니다 — 차차차에게 붙여 넣으세요");
        var box = document.querySelector('[data-skill-preview="' + id + '"]');
        if (box) box.classList.toggle("open", true);
        return;
      }
      if (target.hasAttribute("data-skill-doc")) {
        var sid = target.getAttribute("data-skill-doc");
        var sk = null;
        (skillsData.skills || []).forEach(function (s) { if (s.id === sid) sk = s; });
        if (sk && sk.doc) copyText(sk.doc, "규칙 문서 경로를 복사했습니다");
        return;
      }

      if (target.hasAttribute("data-brain-cat")) {
        setBrainCat(target.getAttribute("data-brain-cat"));
        return;
      }
      if (target.hasAttribute("data-copy-path")) {
        var entry = brainById(target.getAttribute("data-copy-path"));
        if (entry) copyText(entry.path, "경로를 복사했습니다");
        return;
      }
      if (target.hasAttribute("data-brain-item")) {
        var expanded = target.classList.toggle("open");
        target.setAttribute("aria-expanded", expanded ? "true" : "false");
        return;
      }
    });

    document.addEventListener("keydown", function (event) {
      var card = event.target.closest && event.target.closest("[data-open]");
      if (card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        setView("tracks");
        setTrack(card.getAttribute("data-open"));
        return;
      }
      var item = event.target.closest && event.target.closest("[data-brain-item]");
      if (item && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        var open = item.classList.toggle("open");
        item.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      if (!event.target.classList || !event.target.classList.contains("viewtab")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      var tabs = Array.prototype.slice.call(document.querySelectorAll(".viewtab"));
      var idx = tabs.indexOf(event.target);
      if (idx < 0) return;
      var next = event.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      var name = tabs[next].getAttribute("data-view");
      setView(name);
      tabs[next].focus();
    });

    document.addEventListener("change", function (event) {
      var input = event.target;
      if (!input || !input.hasAttribute || !input.hasAttribute("data-check")) return;
      var key = input.getAttribute("data-check");
      localChecks[key] = !!input.checked;
      writeStore();
      var label = input.closest(".check");
      if (label) label.classList.toggle("done", !!input.checked);
      renderProgress();
      renderFilters();
      var trackId = key.split(":")[0];
      refreshCounts(trackId);
      renderProgress();
      renderPicker();
    });

    var skillSearch = el("skill-search");
    if (skillSearch) {
      skillSearch.addEventListener("input", function () {
        setSkillQuery(skillSearch.value || "");
      });
    }
    var brainSearch = el("brain-search");
    if (brainSearch) {
      brainSearch.addEventListener("input", function () {
        setBrainQuery(brainSearch.value || "");
      });
    }
    var skillClear = el("skill-clear");
    if (skillClear) {
      skillClear.addEventListener("click", function () {
        if (skillSearch) skillSearch.value = "";
        setSkillQuery("");
        if (skillSearch) skillSearch.focus();
      });
    }
    var brainClear = el("brain-clear");
    if (brainClear) {
      brainClear.addEventListener("click", function () {
        if (brainSearch) brainSearch.value = "";
        setBrainQuery("");
        if (brainSearch) brainSearch.focus();
      });
    }
  }

  /* ---------- 시작 ---------- */
  function fetchJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status + " " + path);
      return res.json();
    });
  }

  function bindScrollCompact() {
    var bar = document.querySelector(".topbar");
    if (!bar) return;
    var onScroll = function () {
      bar.classList.toggle("compact", window.scrollY > 48);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function parseHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    var parts = raw.split("/");
    return {
      view: VIEWS.indexOf(parts[0]) >= 0 ? parts[0] : null,
      track: parts[1] || ""
    };
  }

  function initialView() {
    var hash = parseHash();
    if (hash.view) return hash.view;
    try {
      var saved = localStorage.getItem(VIEW_KEY);
      if (saved && VIEWS.indexOf(saved) >= 0) return saved;
    } catch (e) {
      /* 무시 */
    }
    return "tracks";
  }

  function initialTrack() {
    var hash = parseHash();
    if (hash.track && trackById(hash.track)) return hash.track;
    try {
      var saved = localStorage.getItem(TRACK_KEY);
      if (saved && (saved === "all" || trackById(saved))) return saved;
    } catch (e) {
      /* 무시 */
    }
    return "all";
  }

  function start() {
    Promise.all([
      fetchJson("data/status.json").catch(function (err) {
        if (window.console && console.error) console.error("[dashboard] status", err);
        el("fallback").hidden = false;
        el("overall-meta").textContent = "상태 파일을 읽지 못했습니다.";
        return null;
      }),
      fetchJson("data/skills.json").catch(function (err) {
        if (window.console && console.error) console.error("[dashboard] skills", err);
        el("skills-fallback").hidden = false;
        return null;
      }),
      fetchJson("data/brain.json").catch(function (err) {
        if (window.console && console.error) console.error("[dashboard] brain", err);
        el("brain-fallback").hidden = false;
        return null;
      })
    ]).then(function (results) {
      statusData = results[0];
      skillsData = results[1];
      brainData = results[2];

      if (statusData && Array.isArray(statusData.tracks)) {
        statusData.tracks.forEach(function (t) { t.checklist = t.checklist || []; });
        renderHeader();
        renderTrackView();
      }
      if (skillsData && Array.isArray(skillsData.skills)) {
        el("skills-intro").textContent = (skillsData.meta || {}).intro || el("skills-intro").textContent;
        renderSkillFilters();
        renderSkills();
      }
      if (brainData && Array.isArray(brainData.entries)) {
        renderBrainFilters();
        renderBrain();
      }
      renderTabCounts();
      var startView = initialView();
      var startTrack = statusData && Array.isArray(statusData.tracks) ? initialTrack() : "all";
      setView(startView, { scroll: false });
      if (statusData && Array.isArray(statusData.tracks)) setTrack(startTrack, { scroll: false });
      bindDelegates();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      start();
      bindScrollCompact();
    });
  } else {
    start();
    bindScrollCompact();
  }
})();
