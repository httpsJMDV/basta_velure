import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

import heroSlide1 from '../assets/hero/hero-slide-1.png';
import heroSlide2 from '../assets/hero/hero-slide-2.png';
import heroSlide3 from '../assets/hero/hero-slide-3.png';
import heroSlide4 from '../assets/hero/hero-slide-4.png';

interface SlideData {
  id: number;
  image: string;
  headingLine1: string;
  headingLine2: string;
  sub: string;
  primaryCta: string;
  secondaryCta: string;
  primaryTo: string;
  secondaryTo: string;
}

const SLIDES: SlideData[] = [
  {
    id: 1,
    image: heroSlide1,
    headingLine1: 'Everything you love.',
    headingLine2: 'In one place.',
    sub: 'Discover trusted sellers, everyday essentials, and deals made for you with 7-day buyer escrow protection.',
    primaryCta: 'Browse Products',
    secondaryCta: 'Explore Categories',
    primaryTo: '/search',
    secondaryTo: '#categories',
  },
  {
    id: 2,
    image: heroSlide2,
    headingLine1: 'Cutting-edge tech.',
    headingLine2: 'Effortless living.',
    sub: 'High-performance smartphones, smart wearables, and audio gear backed by authentic merchant warranties.',
    primaryCta: 'Shop Electronics',
    secondaryCta: 'Explore Categories',
    primaryTo: '/category/electronics',
    secondaryTo: '#categories',
  },
  {
    id: 3,
    image: heroSlide3,
    headingLine1: 'Timeless fashion.',
    headingLine2: 'Everyday comfort.',
    sub: 'Curated everyday apparel, designer leather bags, and premium footwear tailored for your style.',
    primaryCta: 'Explore Fashion',
    secondaryCta: 'Explore Categories',
    primaryTo: '/category/fashion-apparel',
    secondaryTo: '#categories',
  },
  {
    id: 4,
    image: heroSlide4,
    headingLine1: 'Warm spaces.',
    headingLine2: 'Modern aesthetic.',
    sub: 'Transform your home with contemporary lounge armchairs, ambient lighting, and artisanal decor.',
    primaryCta: 'Discover Home',
    secondaryCta: 'Explore Categories',
    primaryTo: '/category/home-living',
    secondaryTo: '#categories',
  },
];

const AUTO_INTERVAL = 6000;

export default function HeroCarousel() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % SLIDES.length);
    }, AUTO_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused]);

  function go(index: number) {
    setCurrent(index);
  }

  function prev() {
    setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length);
  }

  function next() {
    setCurrent((c) => (c + 1) % SLIDES.length);
  }

  const slide = SLIDES[current];

  const handleSecondaryClick = (to: string) => {
    if (to.startsWith('#')) {
      const el = document.getElementById(to.replace('#', ''));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    navigate('/search');
  };

  return (
    <section
      ref={containerRef}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative bg-gradient-to-r from-[#FBF6EE] via-[#FAF3E8] to-[#FAF1E3] overflow-hidden select-none w-full border-b border-amber-200/50 h-[290px] sm:h-[330px] lg:h-[370px]"
    >
      <div className="relative max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 h-full flex items-center justify-between gap-4 lg:gap-8">
        
        {/* ── Left Side: Editorial Typography & Actions ── */}
        <div className="z-20 max-w-sm sm:max-w-md lg:max-w-[440px] shrink-0 space-y-2.5 sm:space-y-3.5">
          {/* Headline */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`head-${slide.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="space-y-0.5 sm:space-y-1"
            >
              <h1 className="text-2xl sm:text-4xl lg:text-[42px] font-serif font-bold text-[#1C1917] leading-[1.12] tracking-tight">
                <span className="block">{slide.headingLine1}</span>
                <span className="block text-brand-red italic font-normal sm:font-bold">{slide.headingLine2}</span>
              </h1>
            </motion.div>
          </AnimatePresence>

          {/* Subtitle */}
          <AnimatePresence mode="wait">
            <motion.p
              key={`sub-${slide.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="text-xs sm:text-sm text-gray-700 leading-relaxed max-w-sm sm:max-w-md font-medium"
            >
              {slide.sub}
            </motion.p>
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <button
              onClick={() => navigate(slide.primaryTo)}
              className="px-5 sm:px-6 py-2.5 rounded-full bg-brand-red hover:bg-[#8e2424] text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 group active:scale-95 cursor-pointer"
            >
              <span>{slide.primaryCta}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => handleSecondaryClick(slide.secondaryTo)}
              className="px-5 sm:px-6 py-2.5 rounded-full bg-white/95 hover:bg-white text-brand-red border border-brand-red/30 hover:border-brand-red text-xs sm:text-sm font-bold shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <span>{slide.secondaryCta}</span>
              <ChevronRight className="w-4 h-4 text-brand-red/70" />
            </button>
          </div>

          {/* Carousel Dots */}
          <div className="flex items-center gap-2 pt-1 sm:pt-2">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => go(i)}
                title={`Slide ${i + 1}`}
                className="p-1 group focus:outline-none cursor-pointer"
              >
                <span
                  className={`block rounded-full transition-all duration-300 ${
                    i === current
                      ? 'w-6 h-1.5 bg-brand-red shadow-xs'
                      : 'w-1.5 h-1.5 bg-amber-900/20 group-hover:bg-amber-900/40'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* ── Right Side: Expanded Banner Graphic (Seamless, Reaches the Middle, Never Cropped) ── */}
        <div className="flex-1 h-full min-w-0 flex items-center justify-center lg:justify-end relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={`img-${slide.id}`}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative h-full w-full flex items-center justify-center lg:justify-end"
            >
              <img
                src={slide.image}
                alt={slide.headingLine1}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                className="h-full w-auto max-h-[95%] max-w-full object-contain object-center lg:object-right select-none protected-image no-save filter drop-shadow-md"
              />
              {/* Shopee-style anti-drag and anti-save protective shield */}
              <div
                className="absolute inset-0 bg-transparent select-none z-10 pointer-events-auto"
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
              />
            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      {/* ── Outer Navigation Slide Arrows ── */}
      <button
        onClick={prev}
        title="Previous slide"
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/90 hover:bg-white text-gray-700 hover:text-brand-red border border-amber-200/60 shadow-md flex items-center justify-center transition-all z-30 active:scale-95 cursor-pointer backdrop-blur-xs"
      >
        <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 hover:text-brand-red" />
      </button>
      <button
        onClick={next}
        title="Next slide"
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/90 hover:bg-white text-gray-700 hover:text-brand-red border border-amber-200/60 shadow-md flex items-center justify-center transition-all z-30 active:scale-95 cursor-pointer backdrop-blur-xs"
      >
        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 hover:text-brand-red" />
      </button>
    </section>
  );
}
