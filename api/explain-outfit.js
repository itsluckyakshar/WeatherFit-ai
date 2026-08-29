export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      weather,
      outfit
    } = req.body;

    const prompt = `
You are WeatherFit AI, a friendly weather and outfit assistant.

Explain WHY the recommended outfit is suitable for the current weather.

Use ONLY the information provided below.
Do not invent weather information.

Keep the response short, friendly and useful.
Use 2-4 short paragraphs or bullet points.
You may use emojis.

CURRENT WEATHER:
Temperature: ${weather.temperature}°C
Feels like: ${weather.feelsLike}°C
Humidity: ${weather.humidity}%
Wind: ${weather.windSpeed} km/h
Rain probability: ${weather.rainProbability}%
Weather condition: ${weather.condition}
UV index: ${weather.uv}

RECOMMENDED OUTFIT:
Top: ${outfit.top}
Bottom: ${outfit.bottom}
Extra/Gear: ${outfit.extra}

Explain why this outfit makes sense for these conditions.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(500).json({
        error: "Gemini API request failed"
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.status(500).json({
        error: "No AI response received"
      });
    }

    return res.status(200).json({
      explanation: reply
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
}
