import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";

// 允许更长的执行时间（Vercel 等平台边界配置）
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { images } = body;

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key in server environment" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const parts = images.map((base64: string) => {
      const [prefix, data] = base64.split(",");
      const mimeType = prefix.match(/:(.*?);/)?.[1] || "image/jpeg";
      return {
        inlineData: { data, mimeType },
      };
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          ...parts,
          {
            text: "作为专业的家纺电商视觉总监，请分析这些家纺四件套的图片，提取出详细的商品特征。请以JSON格式返回，包含以下字段：material(材质), color(颜色), pattern(图案), style(整体风格), details(细节设计，如花边、刺绣等), sellingPoint(核心卖点)。",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            material: { type: Type.STRING, description: "材质描述" },
            color: { type: Type.STRING, description: "颜色描述" },
            pattern: { type: Type.STRING, description: "图案描述" },
            style: { type: Type.STRING, description: "整体风格描述" },
            details: { type: Type.STRING, description: "细节设计描述" },
            sellingPoint: { type: Type.STRING, description: "核心卖点描述" },
          },
          required: [
            "material", "color", "pattern", "style", "details", "sellingPoint"
          ],
        },
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      return NextResponse.json(result);
    } else {
      throw new Error("分析失败，未返回结果");
    }
  } catch (error: any) {
    console.error("Analyze Error:", error);
    return NextResponse.json({ error: error.message || "Failed to analyze" }, { status: 500 });
  }
}
