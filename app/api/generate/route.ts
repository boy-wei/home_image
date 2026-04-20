import { NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60; // 提升执行超时限制

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      images, 
      analysis, 
      genModel, 
      aspectRatio, 
      quality, 
      generationCount, 
      imageTypes, 
      sceneImage, 
      modelImage,
      saasConfig 
    } = body;

    const isCustomModel = genModel === "gemini-3.1-flash-image-preview";
    const isPremiumModel = genModel === "gemini-3-pro-image-preview";
    const imageSize = quality === "uhd" ? "4K" : quality === "hd" ? "2K" : "1K";

    const getPrompt = (type: string) => {
      const isMain = type === "main";
      const typeName = isMain ? "电商主图" : "细节近景图";
      const typeDesc = isMain
        ? "构图突出床品四件套本身，展现整体的视觉效果和生活气息。"
        : "【极其重要】：构图必须采用极近的微距（Macro）或特写（Close-up）视角，镜头需要非常贴近床品！极力展现面料的纹理、材质的细腻感、以及精致的做工细节（如走线、花边、刺绣等）。床品的摆放必须显得随意、凌乱、自然（例如：掀开的一角、堆叠的褶皱），绝对不要整齐平铺！";

      return `作为专业的家纺电商视觉总监和图像后期专家，请基于我提供的原图，生成一张精美的家纺四件套${typeName}。
【注意】：我提供了以下图片：
1. 【商品原图】（必须100%还原细节，但可改变摆放方式）。
${sceneImage ? "2. 【场景/风格参考图】（必须100%严格复刻该场景）。\n" : ""}${modelImage ? `${sceneImage ? "3" : "2"}. 【模特参考图】（必须100%还原面容，但可改变姿势动作）。\n` : ""}
商品细节如下：
- 材质：${analysis.material}
- 颜色：${analysis.color}
- 图案：${analysis.pattern}
${sceneImage ? "" : `- 风格：${analysis.style}\n`}- 细节：${analysis.details}
- 核心卖点：${analysis.sellingPoint}
${saasConfig ? `- SaaS 内容主体：${saasConfig.context}\n- SaaS 补充关键词：${(saasConfig.prompt || []).join("、")}\n` : ""}

【极其重要的要求】：
1. 【商品还原】：必须 100% 还原【商品原图】中的商品材质、花纹、颜色、细节等，绝对不要改变商品的任何原有设计！
2. 【摆放与视角】：在保持商品100%还原的前提下，${typeDesc}
3. 绝对不要在画面中新增任何商标、Logo、文字、水印或多余的装饰物！
4. 【场景与风格】：${sceneImage ? "必须 100% 严格复刻【场景/风格参考图】中的所有场景元素（包括房间结构、背景墙、家具款式、装饰品、光影氛围等），绝对不要改变场景的原有布局，直接将商品自然地融入该场景中。请忽略任何文字描述的风格，完全以这张参考图为准！" : "请大胆改变房间的布局、家具款式、背景墙、装饰品（如地毯、灯具、植物、窗外风景等），以展现不同的家居氛围。"}
${modelImage ? "5. 【模特融入】：必须 100% 还原【模特参考图】中人物的面容长相、五官特征和身材比例！但是，你可以自由改变模特的姿势、神态、表情和肢体动作（例如：坐在床边、躺在床上、整理床铺等），使其与家纺产品产生自然的互动，光影需与场景统一。" : ""}
6. 仅对光影、材质表现力进行高级渲染，使其具备高端家纺品牌的质感。
7. 画质要求：${quality === "uhd" ? "8K超高清，极致细节，电影级画质，摄影级高级打光，超高分辨率。" : quality === "hd" ? "高清画质，细节丰富，高质量渲染。" : "标准清晰度。"}`;
    };

    const allGeneratePromises = [];

    // Custom model via proxy API
    if (isCustomModel) {
      for (const type of imageTypes) {
        const prompt = getPrompt(type);
        const messages = [
          {
            role: "user",
            content: [
              { type: "text", text: prompt + `\n\n【图片比例要求】：请生成比例为 ${aspectRatio} 的图片。` },
              { type: "image_url", image_url: { url: images[0] } }
            ] as any[]
          }
        ];
        if (sceneImage) {
          messages[0].content.push({ type: "image_url", image_url: { url: sceneImage } });
        }
        if (modelImage) {
          messages[0].content.push({ type: "image_url", image_url: { url: modelImage } });
        }

        for (let i = 0; i < generationCount; i++) {
          allGeneratePromises.push((async () => {
             // 采用内部存储的第三方 Key 通信
            const res = await fetch("https://api.aipaibox.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer sk-GSVyn05br0xFxH9J4Kk1LtNviKdCyLWZMmgZdvjPx7565cmK"
              },
              body: JSON.stringify({
                model: genModel,
                messages: messages,
              })
            });
            
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error?.message || "Generation failed from proxy");
            }
            
            const content = data.choices?.[0]?.message?.content || "";
            const match = content.match(/!\[.*?\]\((.*?)\)/);
            if (match && match[1]) return match[1];
            
            const urlMatch = content.match(/(https?:\/\/[^\s)]+)/);
            if (urlMatch && urlMatch[1]) return urlMatch[1];
            
            if (content.startsWith("iVBORw0KGgo") || content.startsWith("/9j/")) {
              return `data:image/jpeg;base64,${content}`;
            }
            
            throw new Error("未能从返回结果中提取到图片: " + content);
          })());
        }
      }
    } else {
      // Official Google GenAI SDK
      const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing API key in server environment");
      }
      const ai = new GoogleGenAI({ apiKey });
      const [prefix, data] = images[0].split(",");
      const mimeType = prefix.match(/:(.*?);/)?.[1] || "image/jpeg";

      for (const type of imageTypes) {
        const prompt = getPrompt(type);
        const parts: any[] = [
          { inlineData: { data, mimeType } },
        ];

        if (sceneImage) {
          const [scenePrefix, sceneData] = sceneImage.split(",");
          parts.push({
            inlineData: {
              data: sceneData,
              mimeType: scenePrefix.match(/:(.*?);/)?.[1] || "image/jpeg",
            },
          });
        }

        if (modelImage) {
          const [modelPrefix, modelData] = modelImage.split(",");
          parts.push({
            inlineData: {
              data: modelData,
              mimeType: modelPrefix.match(/:(.*?);/)?.[1] || "image/jpeg",
            },
          });
        }

        parts.push({ text: prompt });

        for (let i = 0; i < generationCount; i++) {
          const config: any = {};
          config.imageConfig = {
            aspectRatio: aspectRatio,
            ...(isPremiumModel ? { imageSize } : {}),
          };

          allGeneratePromises.push(
            ai.models.generateContent({
              model: genModel,
              contents: { parts },
              config,
            }).then(response => {
              if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                  if (part.inlineData) {
                    return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
                  }
                }
              }
              return null;
            })
          );
        }
      }
    }

    const responses = await Promise.all(allGeneratePromises);
    const newImageUrls = responses.filter(Boolean) as string[];

    if (newImageUrls.length > 0) {
      return NextResponse.json({ images: newImageUrls });
    } else {
      return NextResponse.json({ error: "生成失败，未返回图片数据" }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Generate Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate image" }, { status: 500 });
  }
}
