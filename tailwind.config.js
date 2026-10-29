/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        night: "#1a2533",
        cream: "#f7f3ec",
        creamMuted: "rgba(247, 243, 236, 0.72)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        script: ["Allura", "cursive"],
      },
    },
  },
  plugins: [],
};
