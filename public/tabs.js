document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-btn");
  const slider = document.querySelector(".tab-slider");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      document.querySelector(".tab-btn.active").classList.remove("active");
      tab.classList.add("active");

      if (tab.dataset.tab === "login") {
        slider.style.left = "0";
        loginForm.classList.add("active");
        signupForm.classList.remove("active");
      } else {
        slider.style.left = "50%";
        signupForm.classList.add("active");
        loginForm.classList.remove("active");
      }
    });
  });
});
