# PulseGuard - ESP32 IoT Health Monitoring Dashboard

A static HTML/CSS/JavaScript dashboard for an academic IoT multi-parameter health monitoring prototype.

## Included

- Responsive dashboard for laptop, tablet and mobile
- Heart rate and SpO2 display (MAX30102)
- Infrared temperature (MLX90614)
- Probe temperature (DS18B20)
- ECG sample plot (AD8232)
- Motion / fall flag display (MPU6050 processed by ESP32)
- Recent reading trends
- Display-range alerts
- ThingSpeak channel configuration with configurable field mapping
- Demo mode with clearly marked simulated values
- No backend, paid API, framework, build step or API key required

## Run locally

Open `index.html` in a browser. For best results, run a local static server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to Render

1. Create a GitHub repository and upload `index.html`, `styles.css`, and `app.js`.
2. In Render, choose **New + > Static Site** and connect the repository.
3. Build command: leave blank.
4. Publish directory: `.` (the repository root).
5. Deploy. No environment variables are required.

You can also use any static hosting service that serves these three files.

## ThingSpeak channel mapping

The dashboard uses the ThingSpeak Read API:

`GET https://api.thingspeak.com/channels/CHANNEL_ID/feeds.json?results=30&api_key=READ_API_KEY`

Suggested channel field mapping:

| ThingSpeak field | Value | Unit / format |
|---|---|---|
| Field 1 | Heart rate | BPM |
| Field 2 | SpO2 | % |
| Field 3 | MLX90614 object temperature | °C |
| Field 4 | DS18B20 probe temperature | °C |
| Field 5 | AD8232 ECG ADC sample | ADC counts |
| Field 6 | Fall flag from ESP32 | 0 = no event, 1 = possible fall |

Configure the same mapping in the website's **ThingSpeak configuration** section. Fields can be reassigned in the UI. The field mapping is stored in the browser's local storage.

Use a **Read API Key** in the website only. Never put the ThingSpeak Write API Key in frontend JavaScript. A public channel can be read without a key. A private read key is visible to anyone who can inspect the browser and network requests, so use a public read-only channel for a public demo, or keep the website private. Do not use a write key in the website.

## Important timing limitation for ECG

ThingSpeak is designed for periodic channel updates, not a high-rate continuous ECG stream. The ThingSpeak chart in this project plots the ECG samples that arrive as channel feed entries. It is useful for demonstrating stored samples/trends, but it is **not a diagnostic-quality live ECG waveform**.

For a genuinely smooth live ECG trace, the ESP32 should stream ADC samples to a local web page or a separate real-time transport (for example, a WebSocket server). A static Render-hosted site cannot directly reach an ESP32 on a private home Wi-Fi network unless the device is made reachable through a suitable network setup. This package does not pretend that ThingSpeak provides continuous ECG streaming.

## ESP32 integration contract

Your firmware should:
1. Read and validate the sensor values.
2. Apply your selected calibration and signal-processing methods.
3. Write the values to the ThingSpeak channel fields above.
4. Keep local OLED and buzzer behavior on the ESP32 independent of the website.
5. Set Field 6 to 1 only when the ESP32's chosen fall-detection algorithm reports a possible event.

ThingSpeak free-tier update intervals and rate limits can change. Respect the minimum update interval for your channel plan. The dashboard defaults to a 15-second refresh; it does not make the ESP32 upload more frequently.

## Hardware notes

- MAX30102: heart-rate / SpO2 estimates require correct sensor contact, optical setup, filtering and validation.
- MLX90614: non-contact object temperature is not automatically core body temperature.
- DS18B20: a waterproof probe is not automatically suitable for measuring body temperature; use it only in an appropriate, hygienic, validated arrangement.
- MPU6050: the website displays a fall flag sent by firmware; reliable fall detection needs algorithm design and testing.
- AD8232: the displayed ADC points are raw/processed samples, not an interpreted ECG diagnosis.

This is an educational prototype UI, not a certified medical device. Do not use it for diagnosis, treatment, or emergency decisions.
