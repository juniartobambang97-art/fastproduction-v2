(() => {
  "use strict";

  if (window.__FP_PRAYER_GUARD__) return;
  window.__FP_PRAYER_GUARD__ = true;

  const REDIRECT =
    "https://www.youtube.com/results?search_query=adzan+merdu+Indonesia";

  const FAJR_ANGLE = 20;
  const ISHA_ANGLE = 18;
  const ASR_FACTOR = 1; // Mazhab Syafi'i

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  function localDate() {
    const d = new Date();
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate()
    };
  }

  function solarPosition(year, month, day) {
    const jd =
      Date.UTC(year, month - 1, day, 12) / 86400000 +
      2440587.5;

    const T = (jd - 2451545) / 36525;

    const L0 =
      (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;

    const M =
      357.52911 + T * (35999.05029 - 0.0001537 * T);

    const e =
      0.016708634 - T * (0.000042037 + 0.0000001267 * T);

    const C =
      Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
      Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
      Math.sin(3 * M * RAD) * 0.000289;

    const omega = 125.04 - 1934.136 * T;
    const lambda = (L0 + C - 0.00569 -
      0.00478 * Math.sin(omega * RAD)) * RAD;

    const meanObliq =
      23 + (26 + (21.448 - T *
        (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;

    const obliq =
      (meanObliq + 0.00256 * Math.cos(omega * RAD)) * RAD;

    const decl = Math.asin(
      Math.sin(obliq) * Math.sin(lambda)
    );

    const y = Math.tan(obliq / 2) ** 2;

    const eqTime = 4 * DEG * (
      y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)
    );

    return { decl, eqTime };
  }

  function hourAngle(latitude, decl, altitude) {
    const lat = latitude * RAD;

    const value =
      (Math.sin(altitude * RAD) -
        Math.sin(lat) * Math.sin(decl)) /
      (Math.cos(lat) * Math.cos(decl));

    if (value < -1 || value > 1) return null;

    return Math.acos(value) * DEG;
  }

  function calculate(latitude, longitude) {
    const { year, month, day } = localDate();
    const { decl, eqTime } = solarPosition(year, month, day);

    // Mengikuti zona waktu perangkat.
    // Aktifkan automatic date/time dan automatic time zone.
    const offset = -new Date(
      year, month - 1, day, 12
    ).getTimezoneOffset();

    const noon = 720 - 4 * longitude - eqTime + offset;

    const sunriseAngle = hourAngle(latitude, decl, -0.833);
    const fajrAngle = hourAngle(latitude, decl, -FAJR_ANGLE);
    const ishaAngle = hourAngle(latitude, decl, -ISHA_ANGLE);

    const asrAltitude =
      Math.atan(1 / (
        ASR_FACTOR +
        Math.tan(Math.abs(latitude * RAD - decl))
      )) * DEG;

    const asrAngle = hourAngle(
      latitude, decl, asrAltitude
    );

    if (
      sunriseAngle === null ||
      fajrAngle === null ||
      ishaAngle === null ||
      asrAngle === null
    ) {
      throw new Error("Lokasi berada di wilayah lintang ekstrem");
    }

    return {
      fajr: noon - fajrAngle * 4,
      sunrise: noon - sunriseAngle * 4,
      dhuhr: noon,
      asr: noon + asrAngle * 4,
      maghrib: noon + sunriseAngle * 4,
      isha: noon + ishaAngle * 4
    };
  }

  function currentMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function dateKey() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function check(times) {
    const now = currentMinutes();
    const keyDate = dateKey();

    const prayers = [
      ["fajr", "Subuh"],
      ["dhuhr", "Zuhur"],
      ["asr", "Asar"],
      ["maghrib", "Magrib"],
      ["isha", "Isya"]
    ];

    let fired = {};

    try {
      fired = JSON.parse(
        localStorage.getItem("fp_prayer_fired") || "{}"
      );
    } catch {}

    for (const [key, name] of prayers) {
      const prayerTime = times[key];
      const prayerMinute = Math.floor(prayerTime);

      const fireKey = `${keyDate}_${key}`;

      if (
        now >= prayerMinute &&
        now <= prayerMinute + 2 &&
        !fired[fireKey]
      ) {
        fired = { [fireKey]: true };

        try {
          localStorage.setItem(
            "fp_prayer_fired",
            JSON.stringify(fired)
          );
        } catch {}

        console.info("[FP Prayer] Waktu " + name);
        window.location.replace(REDIRECT);
        return;
      }
    }
  }

  function start() {
    if (!navigator.geolocation) {
      console.warn("[FP Prayer] GPS tidak tersedia");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        try {
          const times = calculate(
            position.coords.latitude,
            position.coords.longitude
          );

          console.info("[FP Prayer] Sistem aktif");

          check(times);

          setInterval(() => {
            const today = dateKey();

            if (today !== window.__FP_PRAYER_DATE__) {
              window.__FP_PRAYER_DATE__ = today;
              try {
                const next = calculate(
                  position.coords.latitude,
                  position.coords.longitude
                );
                check(next);
                window.__FP_PRAYER_TIMES__ = next;
              } catch (error) {
                console.warn("[FP Prayer]", error.message);
              }
            } else {
              check(window.__FP_PRAYER_TIMES__ || times);
            }
          }, 15000);

          window.__FP_PRAYER_DATE__ = dateKey();
          window.__FP_PRAYER_TIMES__ = times;

        } catch (error) {
          console.warn("[FP Prayer]", error.message);
        }
      },
      error => {
        console.warn(
          "[FP Prayer] Lokasi tidak diizinkan:",
          error.message
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 3600000
      }
    );
  }

  start();
})();
