// 공통 UI 스크립트: 모바일 내비게이션 토글
document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      var expanded = nav.classList.contains("open");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }

  // 상위-하위 드롭다운 메뉴 토글
  document.querySelectorAll(".dropdown-toggle").forEach(function (dropToggle) {
    dropToggle.addEventListener("click", function (e) {
      e.preventDefault();
      var item = dropToggle.closest(".nav-item");
      if (!item) return;
      var wasOpen = item.classList.contains("open");
      document.querySelectorAll(".nav-item.open").forEach(function (openItem) {
        if (openItem !== item) openItem.classList.remove("open");
      });
      item.classList.toggle("open", !wasOpen);
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".nav-item")) {
      document.querySelectorAll(".nav-item.open").forEach(function (item) {
        item.classList.remove("open");
      });
    }
  });
});
