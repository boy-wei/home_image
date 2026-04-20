"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  Download,
  X,
  ArrowLeft,
  Settings,
} from "lucide-react";

import Image from "next/image";

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

type Step = "UPLOAD" | "ANALYZING" | "EDIT" | "GENERATING" | "RESULT";

interface AnalysisResult {
  material: string;
  color: string;
  pattern: string;
  style: string;
  details: string;
  sellingPoint: string;
}

const PRESET_STYLES = [
  "极简原木风 (阳光、白墙、原木床架)",
  "法式复古风 (石膏线、复古吊灯、法式门窗)",
  "现代轻奢风 (大理石、金属元素、高级灰背景)",
  "温馨奶油风 (低饱和度、毛绒地毯、暖色氛围灯)",
];

export default function Home() {
  const [step, setStep] = useState<Step>("UPLOAD");
  const [images, setImages] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [genModel, setGenModel] = useState("gemini-2.5-flash-image");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [quality, setQuality] = useState("uhd");
  const [generationCount, setGenerationCount] = useState<number>(1);
  const [imageTypes, setImageTypes] = useState<string[]>(["main"]);
  const [sceneImage, setSceneImage] = useState<string | null>(null);
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [saasConfig, setSaasConfig] = useState<{ userId: string; toolId: string; context: string; prompt: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.data?.type === 'SAAS_INIT') {
        const { userId, toolId, context, prompt } = e.data;
        if (userId && userId !== "null" && userId !== "undefined") {
          setSaasConfig({ userId, toolId, context, prompt });
          try {
            await fetch('/api/tool/launch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, toolId })
            });
          } catch(err) {
            console.error("Launch api failed", err);
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    let loadedCount = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          newImages.push(event.target.result as string);
        }
        loadedCount++;
        if (loadedCount === files.length) {
          setImages((prev) => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSceneUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSceneImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setModelImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const startAnalysis = async () => {
    if (images.length === 0) return;
    setStep("ANALYZING");
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "分析失败，请重试");
      }

      setAnalysis(data as AnalysisResult);
      setStep("EDIT");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "分析过程中发生错误，请重试。");
      setStep("UPLOAD");
    }
  };

  const generateImage = async () => {
    if (!analysis) return;

    const isPremiumModel = genModel === "gemini-3-pro-image-preview";

    if (saasConfig) {
      try {
        const verifyRes = await fetch('/api/tool/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: saasConfig.userId, toolId: saasConfig.toolId })
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || (!verifyData.success && !verifyData.valid)) {
          setError(verifyData.message || "积分不足");
          return;
        }
      } catch (err: any) {
        setError("校验积分失败，请检查网络或配置");
        return;
      }
    }

    setStep("GENERATING");
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        if (data.error?.includes("Requested entity was not found")) {
          throw new Error("所选模型不可用 (Requested entity was not found)，请检查后台API Key状态。");
        }
        throw new Error(data.error || "生成失败");
      }

      if (data.images && data.images.length > 0) {
        setGeneratedImages((prev) => [...data.images, ...prev]);
        setSelectedImageIndex(0);
        setStep("RESULT");

        if (saasConfig) {
          try {
            await fetch('/api/tool/consume', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: saasConfig.userId, toolId: saasConfig.toolId })
            });
          } catch(err) {
            console.error("Consume api failed", err);
          }
        }
      } else {
        throw new Error("生成失败，未返回图片数据");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "生成图片过程中发生错误，请重试。");
      setStep("EDIT");
    }
  };

  const reset = () => {
    setStep("UPLOAD");
    setImages([]);
    setAnalysis(null);
    setGeneratedImages([]);
    setSelectedImageIndex(0);
    setError(null);
    setGenModel("gemini-2.5-flash-image");
    setAspectRatio("3:4");
    setQuality("uhd");
    setGenerationCount(1);
    setSceneImage(null);
    setModelImage(null);
  };

  return (
    <main className="flex-1 flex flex-col">
      {/* Header */}
      <header className="w-full py-6 px-8 border-b border-[#1a1a1a]/10 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-[#1a1a1a]/20 flex items-center justify-center bg-white">
            <Sparkles className="w-5 h-5 text-[#1a1a1a]" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-medium leading-none tracking-wide">
              LUMINA
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#1a1a1a]/60 mt-1">
              AI Visual Studio
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="hidden md:flex items-center gap-4 text-xs uppercase tracking-widest font-medium text-[#1a1a1a]/40">
          <button
            onClick={() => setStep("UPLOAD")}
            className={`hover:text-[#1a1a1a] transition-colors ${step === "UPLOAD" ? "text-[#1a1a1a]" : ""}`}
          >
            01. Upload
          </button>
          <ArrowRight className="w-3 h-3" />
          <button
            onClick={() => {
              if (analysis) setStep("EDIT");
            }}
            disabled={!analysis && step !== "ANALYZING"}
            className={`transition-colors ${analysis || step === "ANALYZING" ? "hover:text-[#1a1a1a] cursor-pointer" : "cursor-not-allowed opacity-50"} ${step === "ANALYZING" || step === "EDIT" ? "text-[#1a1a1a]" : ""}`}
          >
            02. Analyze
          </button>
          <ArrowRight className="w-3 h-3" />
          <button
            onClick={() => {
              if (generatedImages.length > 0) setStep("RESULT");
            }}
            disabled={generatedImages.length === 0 && step !== "GENERATING"}
            className={`transition-colors ${generatedImages.length > 0 || step === "GENERATING" ? "hover:text-[#1a1a1a] cursor-pointer" : "cursor-not-allowed opacity-50"} ${step === "GENERATING" || step === "RESULT" ? "text-[#1a1a1a]" : ""}`}
          >
            03. Generate
          </button>

          <div className="w-px h-4 bg-[#1a1a1a]/20 ml-2"></div>
          <button
            onClick={reset}
            className="ml-2 flex items-center gap-1 hover:text-red-600 transition-colors"
            title="重新开始"
          >
            <RefreshCw className="w-3 h-3" /> 重置
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center p-6 md:p-12 relative overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* UPLOAD STEP */}
          {step === "UPLOAD" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-4xl flex flex-col items-center my-auto"
            >
              <div className="text-center mb-12">
                <h2 className="font-serif text-4xl md:text-5xl font-light mb-4">
                  Craft Your Vision
                </h2>
                <p className="text-[#1a1a1a]/60 max-w-lg mx-auto">
                  上传家纺四件套的实拍图与细节图，AI将为您提取商品特征，并生成高级质感的电商主图。
                </p>
              </div>

              <div className="w-full bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#1a1a1a]/5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Product Image Upload */}
                  <div>
                    <h3 className="font-serif text-xl mb-4">
                      上传家纺原图 (必填)
                    </h3>
                    <div
                      className="border-2 border-dashed border-[#1a1a1a]/15 rounded-[24px] p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-[#1a1a1a]/[0.02] transition-colors min-h-[16rem]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                      />
                      <div className="w-12 h-12 rounded-full bg-[#f5f2ed] flex items-center justify-center mb-4">
                        <Upload className="w-5 h-5 text-[#1a1a1a]/60" />
                      </div>
                      <p className="font-medium mb-1">点击或拖拽上传</p>
                      <p className="text-xs text-[#1a1a1a]/50 text-center">
                        支持 JPG, PNG，建议上传包含整体与细节的多张图片
                      </p>
                    </div>
                  </div>

                  {/* Model Image Upload */}
                  <div>
                    <h3 className="font-serif text-xl mb-4">
                      上传模特图 (可选)
                    </h3>
                    <div
                      className="border-2 border-dashed border-[#1a1a1a]/15 rounded-[24px] p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-[#1a1a1a]/[0.02] transition-colors min-h-[16rem] relative overflow-hidden"
                      onClick={() =>
                        !modelImage && modelInputRef.current?.click()
                      }
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={modelInputRef}
                        onChange={handleModelUpload}
                      />
                      {modelImage ? (
                        <>
                          <Image
                            src={modelImage}
                            alt="Model Upload"
                            fill
                            className="object-cover"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModelImage(null);
                            }}
                            className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-[#f5f2ed] flex items-center justify-center mb-4">
                            <ImageIcon className="w-5 h-5 text-[#1a1a1a]/60" />
                          </div>
                          <p className="font-medium mb-1">点击上传模特</p>
                          <p className="text-xs text-[#1a1a1a]/50 text-center">
                            AI会将模特自然融入场景中
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {images.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-[#1a1a1a]/10">
                    <h3 className="text-sm uppercase tracking-widest font-medium text-[#1a1a1a]/60 mb-4">
                      已上传图片 ({images.length})
                    </h3>
                    <div className="flex gap-4 overflow-x-auto pb-4">
                      {images.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative w-24 h-24 flex-shrink-0 rounded-2xl overflow-hidden group border border-[#1a1a1a]/10"
                        >
                          <Image
                            src={img}
                            alt={`Upload ${idx}`}
                            fill
                            className="object-cover"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={() => removeImage(idx)}
                            className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-sm"
                          >
                            移除
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={startAnalysis}
                        className="bg-[#1a1a1a] text-white px-8 py-4 rounded-full font-medium tracking-wide hover:bg-black transition-colors flex items-center gap-2"
                      >
                        开始AI分析 <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm">
                    {error}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ANALYZING STEP */}
          {step === "ANALYZING" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center text-center my-auto py-12"
            >
              <div className="relative w-32 h-32 mb-8">
                <div className="absolute inset-0 border-2 border-[#1a1a1a]/10 rounded-full"></div>
                <div className="absolute inset-0 border-2 border-[#1a1a1a] rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-[#1a1a1a] animate-pulse" />
                </div>
              </div>
              <h2 className="font-serif text-3xl font-light mb-2">
                Analyzing Details
              </h2>
              <p className="text-[#1a1a1a]/60 tracking-wide">
                AI正在提取材质、颜色与细节特征...
              </p>
            </motion.div>
          )}

          {/* EDIT STEP */}
          {step === "EDIT" && analysis && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 my-auto py-8"
            >
              <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#1a1a1a]/5 h-full">
                  <h3 className="font-serif text-2xl mb-6 flex items-center gap-3">
                    <ImageIcon className="w-5 h-5 opacity-50" />
                    Reference Images
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {images.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-2xl overflow-hidden border border-[#1a1a1a]/10"
                      >
                        <Image
                          src={img}
                          alt={`Ref ${idx}`}
                          fill
                          className="object-cover"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#1a1a1a]/5">
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h2 className="font-serif text-3xl font-light mb-2">
                      Refine Details
                    </h2>
                    <p className="text-[#1a1a1a]/60 text-sm">
                      您可以修改AI提取的特征，以指导最终主图的生成。
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-[#f5f2ed] flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                </div>

                <div className="space-y-5">
                  {Object.entries(analysis).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest font-semibold text-[#1a1a1a]/50">
                        {key === "material" && "材质 (Material)"}
                        {key === "color" && "颜色 (Color)"}
                        {key === "pattern" && "图案 (Pattern)"}
                        {key === "style" && "风格 (Style)"}
                        {key === "details" && "细节 (Details)"}
                        {key === "sellingPoint" && "核心卖点 (Selling Point)"}
                      </label>
                      {key === "style" && (
                        <div className="flex flex-col gap-3 mb-2">
                          <div className="flex flex-wrap gap-2">
                            {PRESET_STYLES.map((preset) => (
                              <button
                                key={preset}
                                onClick={() =>
                                  setAnalysis({ ...analysis, style: preset })
                                }
                                className="text-[10px] px-3 py-1.5 rounded-full border border-[#1a1a1a]/20 hover:bg-[#1a1a1a] hover:text-white transition-colors"
                              >
                                {preset.split(" ")[0]}
                              </button>
                            ))}
                          </div>

                          {/* Scene Reference Image inside Style section */}
                          <div className="flex items-center gap-4 mt-2">
                            {sceneImage && (
                              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#1a1a1a]/10 shrink-0">
                                <Image
                                  src={sceneImage}
                                  alt="Scene Reference"
                                  fill
                                  className="object-cover"
                                />
                                <button
                                  onClick={() => setSceneImage(null)}
                                  className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => sceneInputRef.current?.click()}
                              className="flex-1 border border-dashed border-[#1a1a1a]/20 rounded-xl p-3 flex items-center justify-center gap-2 text-[#1a1a1a]/60 hover:bg-[#f5f2ed]/50 hover:border-[#1a1a1a]/40 transition-colors text-xs"
                            >
                              <Upload className="w-4 h-4" />
                              {sceneImage
                                ? "更换自定义场景图"
                                : "上传自定义场景图 (覆盖预设风格)"}
                            </button>
                            <input
                              type="file"
                              ref={sceneInputRef}
                              onChange={handleSceneUpload}
                              accept="image/*"
                              className="hidden"
                            />
                          </div>
                        </div>
                      )}
                      <textarea
                        value={value}
                        onChange={(e) =>
                          setAnalysis({ ...analysis, [key]: e.target.value })
                        }
                        className="w-full bg-[#f5f2ed]/50 border border-[#1a1a1a]/10 rounded-xl p-4 text-sm focus:outline-none focus:border-[#1a1a1a]/30 focus:bg-white transition-colors resize-none"
                        rows={2}
                      />
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm">
                    {error}
                  </div>
                )}

                {/* Generation Settings */}
                <div className="mt-8 pt-8 border-t border-[#1a1a1a]/10">
                  <h3 className="font-serif text-xl mb-6 flex items-center gap-2">
                    <Settings className="w-5 h-5 opacity-50" />
                    Generation Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Model */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest font-semibold text-[#1a1a1a]/50">
                        生图模型 (Model)
                      </label>
                      <select
                        value={genModel}
                        onChange={(e) => setGenModel(e.target.value)}
                        className="w-full bg-[#f5f2ed]/50 border border-[#1a1a1a]/10 rounded-xl p-3 text-sm focus:outline-none focus:border-[#1a1a1a]/30 focus:bg-white transition-colors cursor-pointer"
                      >
                        <option value="gemini-2.5-flash-image">
                          Gemini 2.5 Flash Image (默认)
                        </option>
                        <option value="gemini-3.1-flash-image-preview">
                          Gemini 3.1 Flash Image (支持多尺寸/高清)
                        </option>
                        <option value="gemini-3-pro-image-preview">
                          Gemini 3 Pro Image (最高画质)
                        </option>
                      </select>
                    </div>
                    {/* Aspect Ratio */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest font-semibold text-[#1a1a1a]/50">
                        尺寸比例 (Aspect Ratio)
                      </label>
                      <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        className="w-full bg-[#f5f2ed]/50 border border-[#1a1a1a]/10 rounded-xl p-3 text-sm focus:outline-none focus:border-[#1a1a1a]/30 focus:bg-white transition-colors cursor-pointer"
                      >
                        <option value="3:4">3:4 (竖版电商)</option>
                        <option value="1:1">1:1 (方形主图)</option>
                        <option value="4:3">4:3 (横版展示)</option>
                        <option value="16:9">16:9 (宽屏海报)</option>
                      </select>
                    </div>
                    {/* Quality */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest font-semibold text-[#1a1a1a]/50">
                        清晰度 (Quality)
                      </label>
                      <select
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                        className="w-full bg-[#f5f2ed]/50 border border-[#1a1a1a]/10 rounded-xl p-3 text-sm focus:outline-none focus:border-[#1a1a1a]/30 focus:bg-white transition-colors cursor-pointer"
                      >
                        <option value="uhd">超清 (Ultra HD / 8K)</option>
                        <option value="hd">高清 (HD)</option>
                        <option value="standard">标准 (Standard)</option>
                      </select>
                    </div>
                    {/* Generation Count */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest font-semibold text-[#1a1a1a]/50">
                        生成数量 (Count)
                      </label>
                      <select
                        value={generationCount}
                        onChange={(e) =>
                          setGenerationCount(Number(e.target.value))
                        }
                        className="w-full bg-[#f5f2ed]/50 border border-[#1a1a1a]/10 rounded-xl p-3 text-sm focus:outline-none focus:border-[#1a1a1a]/30 focus:bg-white transition-colors cursor-pointer"
                      >
                        <option value={1}>1 张</option>
                        <option value={2}>2 张</option>
                        <option value={3}>3 张</option>
                        <option value={4}>4 张</option>
                      </select>
                    </div>
                    {/* Image Types */}
                    <div className="flex flex-col gap-2 md:col-span-3">
                      <label className="text-xs uppercase tracking-widest font-semibold text-[#1a1a1a]/50">
                        生成类型 (Generation Type)
                      </label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={imageTypes.includes("main")}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setImageTypes([...imageTypes, "main"]);
                              } else {
                                if (imageTypes.length > 1) {
                                  setImageTypes(imageTypes.filter((t) => t !== "main"));
                                }
                              }
                            }}
                            className="w-4 h-4 rounded border-[#1a1a1a]/20 text-[#1a1a1a] focus:ring-[#1a1a1a]"
                          />
                          <span className="text-sm">电商主图 (Main Image)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={imageTypes.includes("closeup")}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setImageTypes([...imageTypes, "closeup"]);
                              } else {
                                if (imageTypes.length > 1) {
                                  setImageTypes(imageTypes.filter((t) => t !== "closeup"));
                                }
                              }
                            }}
                            className="w-4 h-4 rounded border-[#1a1a1a]/20 text-[#1a1a1a] focus:ring-[#1a1a1a]"
                          />
                          <span className="text-sm">细节近景图 (Close-up)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex justify-between items-center">
                  <button
                    onClick={() => setStep("UPLOAD")}
                    className="text-[#1a1a1a]/60 hover:text-[#1a1a1a] transition-colors flex items-center gap-2 font-medium text-sm uppercase tracking-wide"
                  >
                    <ArrowLeft className="w-4 h-4" /> 返回重新上传
                  </button>
                  <button
                    onClick={generateImage}
                    className="bg-[#1a1a1a] text-white px-8 py-4 rounded-full font-medium tracking-wide hover:bg-black transition-colors flex items-center gap-2"
                  >
                    生成商品主图 <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* GENERATING STEP */}
          {step === "GENERATING" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center text-center my-auto py-12"
            >
              <div className="relative w-48 h-64 mb-8 rounded-2xl overflow-hidden bg-[#1a1a1a]/5 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-[#f5f2ed] to-transparent z-10"></div>
                <Loader2 className="w-8 h-8 text-[#1a1a1a]/40 animate-spin z-20" />
              </div>
              <h2 className="font-serif text-3xl font-light mb-2">
                Crafting Masterpiece
              </h2>
              <p className="text-[#1a1a1a]/60 tracking-wide">
                AI正在渲染高级质感商品主图，请稍候...
              </p>
            </motion.div>
          )}

          {/* RESULT STEP */}
          {step === "RESULT" && generatedImages.length > 0 && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-5xl flex flex-col items-center my-auto py-8"
            >
              <div className="w-full bg-white rounded-[32px] p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#1a1a1a]/5">
                <div className="flex flex-col md:flex-row gap-12">
                  <div className="flex-1 flex flex-col gap-4">
                    <div
                      className={`relative ${aspectRatio === "1:1" ? "aspect-square" : aspectRatio === "4:3" ? "aspect-[4/3]" : aspectRatio === "16:9" ? "aspect-video" : "aspect-[3/4]"} w-full rounded-[24px] overflow-hidden shadow-2xl cursor-zoom-in group`}
                      onClick={() => setIsLightboxOpen(true)}
                    >
                      <Image
                        src={generatedImages[selectedImageIndex]}
                        alt="Generated Product Image"
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="bg-white/90 backdrop-blur-sm text-[#1a1a1a] px-4 py-2 rounded-full font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-4 group-hover:translate-y-0">
                          点击查看大图
                        </div>
                      </div>
                    </div>

                    {/* History Gallery */}
                    {generatedImages.length > 1 && (
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {generatedImages.map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedImageIndex(idx)}
                            className={`relative w-20 h-24 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${selectedImageIndex === idx ? "border-[#1a1a1a] shadow-md" : "border-transparent hover:border-[#1a1a1a]/30"}`}
                          >
                            <Image
                              src={img}
                              alt={`History ${idx}`}
                              fill
                              className="object-cover"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-center">
                    <h2 className="font-serif text-4xl font-light mb-6">
                      The Final Result
                    </h2>
                    <p className="text-[#1a1a1a]/60 mb-8 leading-relaxed">
                      基于您提供的细节特征，AI已为您生成这张具备高级质感、光影柔和的电商主图。您可以点击下方按钮生成不同布局和背景的更多版本。
                    </p>

                    <div className="space-y-4">
                      <a
                        href={generatedImages[selectedImageIndex]}
                        download={`product-main-image-${selectedImageIndex}.png`}
                        className="w-full bg-[#1a1a1a] text-white px-8 py-4 rounded-full font-medium tracking-wide hover:bg-black transition-colors flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" /> 下载当前高清原图
                      </a>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setStep("EDIT")}
                          className="w-full bg-white border border-[#1a1a1a]/20 text-[#1a1a1a] px-4 py-4 rounded-full font-medium tracking-wide hover:bg-[#f5f2ed] transition-colors flex items-center justify-center gap-2"
                        >
                          <ArrowLeft className="w-4 h-4" /> 返回修改特征
                        </button>
                        <button
                          onClick={generateImage}
                          className="w-full bg-white border border-[#1a1a1a]/20 text-[#1a1a1a] px-4 py-4 rounded-full font-medium tracking-wide hover:bg-[#f5f2ed] transition-colors flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" /> 生成新场景
                        </button>
                      </div>
                      <button
                        onClick={reset}
                        className="w-full text-[#1a1a1a]/60 py-4 font-medium tracking-wide hover:text-red-600 transition-colors text-sm uppercase flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" /> 重置并重新开始
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lightbox */}
        <AnimatePresence>
          {isLightboxOpen && generatedImages.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 md:p-12"
              onClick={() => setIsLightboxOpen(false)}
            >
              <button
                className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
                onClick={() => setIsLightboxOpen(false)}
              >
                <X className="w-8 h-8" />
              </button>
              <div
                className="relative w-full h-full max-w-5xl"
                onClick={(e) => e.stopPropagation()}
              >
                <Image
                  src={generatedImages[selectedImageIndex]}
                  alt="Generated Product Image Fullscreen"
                  fill
                  className="object-contain"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
