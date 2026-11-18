/* =========================================================
   AI 비서실 통합 관제탑 — app.js
   - data/status.json 을 읽어 7개 트랙 카드를 그립니다.
   - 체크 상태는 브라우저(localStorage)에만 저장됩니다.
   - 공개 저장소 배포를 전제로 하므로 개인정보를 담지 않습니다.
   ========================================================= */
(function () {
  "use strict";

  var STORE_KEY = "execdash.v1.checks";
  var TZ = "Asia/Seoul";
  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  var STATUS = {
    active: { label: "가동 중", cls: "ok", icon: "●" },
    waiting: { label: "대기", cls: "wait", icon: "◔" },
    blocked: { label: "확인 필요", cls: "block", icon: "!" },
    paused: { label: "일시정지", cls: "pause", icon: "❚❚" },
    done: { label: "완료", cls: "done", icon: "✓" }
  };

  var data = null;
  var filters = { track: "all", role: "all" };
  var localChecks = readStore();

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

  function copyText(text, okMessage) {
    var done = function () {
      toast(okMessage || "복사했습니다");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        legacyCopy(text) ? done() : toast("복사가 막혔습니다. 명령을 길게 눌러 복사해 주세요.");
      });
    } else if (legacyCopy(text)) {
      done();
    } else {
      toast("복사가 막혔습니다. 명령을 길게 눌러 복사해 주세요.");
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

  /* ---------- 집계 ---------- */
  function itemsFor(track) {
    if (filters.role === "all") return track.checklist.slice();
    return track.checklist.filter(function (item) {
      return (item.role || "main") === filters.role;
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
    data.tracks.forEach(function (track) {
      var s = statsFor(track);
      sum.done += s.done;
      sum.total += s.total;
    });
    sum.pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
    return sum;
  }

  function countByStatus() {
    var out = { active: 0, waiting: 0, blocked: 0, paused: 0, done: 0 };
    data.tracks.forEach(function (t) {
      if (out[t.status] != null) out[t.status] += 1;
    });
    return out;
  }

  /* ---------- 상단 ---------- */
  function renderHeader() {
    el("app-title").textContent = data.meta.title || "AI 비서실 통합 관제탑";
    el("app-sub").textContent = data.meta.subtitle || "";
    el("sync-time").textContent = fmtStamp(data.meta.generated_at);
    el("privacy-note").textContent = data.meta.privacy_notice || "";
    el("foot-build").textContent = "status.json · " + fmtStamp(data.meta.generated_at);

    var roles = el("roles");
    roles.innerHTML = ["main", "sub"]
      .map(function (key) {
        var r = data.roles[key] || {};
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

  function renderProgress() {
    var t = totals();
    el("overall-pct").textContent = t.pct + "%";
    el("overall-bar").style.width = t.pct + "%";
    el("overall-bar-wrap").setAttribute("aria-valuenow", String(t.pct));

    var c = countByStatus();
    var roleName = filters.role === "all" ? "전체 담당" : (data.roles[filters.role] || {}).name || filters.role;
    var parts = [
      roleName,
      "체크 " + t.done + "/" + t.total + "항목",
      "가동 " + c.active,
      "대기 " + c.waiting
    ];
    if (c.blocked) parts.push("확인 필요 " + c.blocked);
    el("overall-title").textContent =
      filters.track === "all" ? "전체 진행률" : (trackById(filters.track) || {}).name + " 진행률";
    el("overall-meta").textContent = parts.join(" · ");
  }

  /* ---------- 필터 ---------- */
  function trackById(id) {
    for (var i = 0; i < data.tracks.length; i++) {
      if (data.tracks[i].id === id) return data.tracks[i];
    }
    return null;
  }

  function renderFilters() {
    var trackRow = el("track-filters");
    var chips = [
      { id: "all", label: "전체", icon: "◎", count: data.tracks.length }
    ].concat(
      data.tracks.map(function (t) {
        return {
          id: t.id,
          label: t.name,
          icon: t.icon,
          count: t.checklist.length
        };
      })
    );

    trackRow.innerHTML = chips
      .map(function (c) {
        var selected = filters.track === c.id;
        return (
          '<button type="button" class="chip" role="tab" data-track="' + esc(c.id) + '"' +
          ' aria-selected="' + (selected ? "true" : "false") + '">' +
          '<span aria-hidden="true">' + esc(c.icon) + "</span>" + esc(c.label) +
          '<span class="chip-count">' + c.count + "</span>" +
          "</button>"
        );
      })
      .join("");

    var roleRow = el("role-filters");
    var roles = [{ id: "all", label: "담당 전체" }];
    ["main", "sub"].forEach(function (key) {
      var r = data.roles[key] || {};
      roles.push({ id: key, label: r.name || key, kind: r.kind || "" });
    });

    roleRow.innerHTML = roles
      .map(function (r) {
        var pressed = filters.role === r.id;
        var count = "";
        if (r.id !== "all") {
          var open = 0;
          data.tracks.forEach(function (track) {
            track.checklist.forEach(function (item) {
              if ((item.role || "main") === r.id && !isChecked(track, item)) open += 1;
            });
          });
          count = '<span class="chip-count">' + open + "</span>";
        }
        return (
          '<button type="button" class="chip" data-role="' + esc(r.id) + '"' +
          ' aria-pressed="' + (pressed ? "true" : "false") + '">' + esc(r.label) + count + "</button>"
        );
      })
      .join("");
  }

  function setTrack(id) {
    filters.track = id;
    renderFilters();
    renderProgress();
    renderTracks();
    if (id !== "all") {
      var card = document.querySelector('[data-card="' + id + '"]');
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setRole(id) {
    filters.role = id;
    renderFilters();
    renderProgress();
    renderTracks();
  }

  /* ---------- 카드 ---------- */
  function badge(status) {
    var s = STATUS[status] || { label: status || "—", cls: "pause" };
    return '<span class="badge ' + s.cls + '">' + esc(s.label) + "</span>";
  }

  function renderRunBox(kind, run) {
    var label = kind === "next" ? "다음 스케줄" : "최근 실행";
    var when = fmtWhen(run && run.at, run && run.at ? null : (run && run.label));
    var what = (run && run.label) || "";
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
      var role = (data.roles || {})[key] || {};
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
    // 대부분이 메인 담당이라, 소수인 서브 담당 항목에만 표식을 남깁니다.
    var roleLabel = function (role) {
      if (filters.role !== "all") return "";
      if (role !== "sub") return "";
      var r = (data.roles || {}).sub || {};
      return '<span class="role-pill">' + esc(r.kind || "Sub") + "</span>";
    };
    return (
      '<ul class="checks">' +
      items.map(function (item) {
        var checked = isChecked(track, item);
        var role = item.role || "main";
        return (
          '<li>' +
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
    var mainName = ((data.roles || {}).main || {}).name || "차차차";
    var subName = ((data.roles || {}).sub || {}).name || "클로드 워커";
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

  function renderCard(track) {
    var s = statsFor(track);
    var meter = "";
    if (track.meter) {
      var mPct = track.meter.max ? Math.round((track.meter.value / track.meter.max) * 100) : 0;
      meter =
        '<div class="card-progress">' +
        '<div class="card-progress-head"><span>' + esc(track.meter.label) +
        "</span><strong>" + esc(track.meter.value) + " / " + esc(track.meter.max) + " " + esc(track.meter.unit || "") +
        "</strong></div>" +
        '<div class="bar"><div class="bar-fill" style="width:' + Math.max(mPct, 2) + '%"></div></div>' +
        "</div>";
    }

    return (
      '<article class="card" data-card="' + esc(track.id) + '" style="--accent:' + esc(track.accent || "#5b8cff") + '">' +
      '<div class="card-inner">' +
        '<div class="card-head">' +
          '<span class="card-icon" aria-hidden="true">' + esc(track.icon) + "</span>" +
          '<div class="card-titles">' +
            '<h2 class="card-name"><span class="card-no">' + esc(track.no) + "</span>" + esc(track.name) + "</h2>" +
            '<p class="card-tagline">' + esc(track.tagline || "") + "</p>" +
          "</div>" +
          badge(track.status) +
        "</div>" +
        '<p class="card-summary">' + esc(track.summary || "") + "</p>" +
        '<div class="card-progress">' +
          '<div class="card-progress-head"><span>체크리스트</span><strong>' + s.done + " / " + s.total + " · " + s.pct + "%</strong></div>" +
          '<div class="bar"><div class="bar-fill" style="width:' + (s.pct || 0) + '%"></div></div>' +
        "</div>" +
        meter +
        '<div class="runs">' +
          renderRunBox("next", track.next_run) +
          renderRunBox("last", track.last_run) +
        "</div>" +
        '<div class="section"><h3 class="section-title">스케줄</h3><ul class="sched">' +
          (track.schedule || []).map(function (row) {
            return '<li><span class="when">' + esc(row.when) + '</span><span class="what">' + esc(row.what) + "</span></li>";
          }).join("") +
        "</ul></div>" +
        '<div class="section"><h3 class="section-title">담당 분담</h3>' + renderOwners(track) + "</div>" +
        '<div class="section"><h3 class="section-title">진행 체크</h3>' + renderChecks(track) + "</div>" +
        renderLinks(track) +
        renderCommands(track) +
        (track.note ? '<p class="card-note">' + esc(track.note) + "</p>" : "") +
      "</div>" +
      "</article>"
    );
  }

  function renderTracks() {
    var host = el("tracks");
    var list = data.tracks.filter(function (t) {
      return filters.track === "all" || t.id === filters.track;
    });
    host.classList.toggle("single", filters.track !== "all");
    host.innerHTML = list.map(renderCard).join("");
    el("empty").hidden = list.length > 0;
  }

  function renderAlerts() {
    var host = el("alerts");
    var alerts = (data.alerts || []).filter(function (a) {
      return filters.track === "all" || a.track === filters.track;
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
    var openClass = alerts._open ? " open" : "";

    host.innerHTML =
      '<div class="alerts-head">' +
        '<span class="alerts-dot" aria-hidden="true">' + (warnCount ? "⚠️" : "ℹ️") + "</span>" +
        '<strong>' + esc(summary.join(" · ")) + "</strong>" +
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
      })
      .join("") +
      "</div>";
  }

  function renderAll() {
    renderHeader();
    renderFilters();
    renderProgress();
    renderAlerts();
    renderTracks();
  }

  /* ---------- 이벤트 ---------- */
  function bindDelegates() {
    document.addEventListener("click", function (event) {
      var target = event.target.closest("[data-track],[data-role],[data-cmd],[data-jump],[data-alerts-toggle],#reset-checks");
      if (!target) return;

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
        renderAll();
        toast("내 체크를 초기화했습니다");
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
      }
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
      var track = trackById(trackId);
      if (track) {
        var s = statsFor(track);
        var card = document.querySelector('[data-card="' + trackId + '"]');
        if (card) {
          var strong = card.querySelector(".card-progress-head strong");
          var fill = card.querySelector(".card-progress .bar-fill");
          if (strong) strong.textContent = s.done + " / " + s.total + " · " + s.pct + "%";
          if (fill) fill.style.width = (s.pct || 0) + "%";
        }
      }
    });
  }

  /* ---------- 시작 ---------- */
  function fail() {
    el("fallback").hidden = false;
    el("overall-meta").textContent = "상태 파일을 읽지 못했습니다.";
  }

  function start() {
    fetch("data/status.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || !Array.isArray(json.tracks)) throw new Error("bad shape");
        data = json;
        data.tracks.forEach(function (t) { t.checklist = t.checklist || []; });
        renderAll();
        bindDelegates();
      })
      .catch(function (err) {
        if (window.console && console.error) console.error("[dashboard]", err);
        fail();
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
