import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

import heroSlide1 from '../assets/hero/hero-slide-1.png';
import techLg from '../assets/hero/scene-tech-1920.webp';
import techSm from '../assets/hero/scene-tech-1024.webp';
import fashionLg from '../assets/hero/scene-fashion-1920.webp';
import fashionSm from '../assets/hero/scene-fashion-1024.webp';
import homeLg from '../assets/hero/scene-home-1920.webp';
import homeSm from '../assets/hero/scene-home-1024.webp';
import beautyLg from '../assets/hero/scene-beauty-1920.webp';
import beautySm from '../assets/hero/scene-beauty-1024.webp';

/**
 * A scene is a full 16:9 picture with its own cream background and empty space on the left for the headline: it fills
 * the banner and fades into it. A cutout is a transparent product group drawn over the banner.
 */
type SlideArt = { kind: 'scene'; src: string; srcSet: string } | { kind: 'cutout'; src: string };

interface SlideData {
  id: number;
  art: SlideArt;
  /** The picture's own background colour, so the banner and the picture meet without a seam. */
  bg: string;
  headingLine1: string;
  headingLine2: string;
  sub: string;
  primaryCta: string;
  secondaryCta: string;
  primaryTo: string;
  secondaryTo: string;
}

const scene = (lg: string, sm: string): SlideArt => ({ kind: 'scene', src: lg, srcSet: `${sm} 1024w, ${lg} 1920w` });

const SLIDES: SlideData[] = [
  {
    id: 1,
    art: { kind: 'cutout', src: heroSlide1 },
    bg: '#FBF3E6',
    headingLine1: 'Everything you love.',
    headingLine2: 'In one place.',
    sub: 'Discover trusted sellers, everyday essentials, and deals made for you, with 7-day returns on every order.',
    primaryCta: 'Browse Products',
    secondaryCta: 'Explore Categories',
    primaryTo: '/search',
    secondaryTo: '#categories',
  },
  {
    id: 2,
    art: scene(techLg, techSm),
    bg: '#FDEFDC',
    headingLine1: 'Cutting-edge tech.',
    headingLine2: 'Effortless living.',
    sub: 'High-performance smartphones, smart wearables, and audio gear backed by authentic merchant warranties.',
    primaryCta: 'Shop Electronics',
    secondaryCta: 'Explore Categories',
    primaryTo: '/category/mobile-gadgets-computers',
    secondaryTo: '#categories',
  },
  {
    id: 3,
    art: scene(fashionLg, fashionSm),
    bg: '#FEF4E5',
    headingLine1: 'Timeless fashion.',
    headingLine2: 'Everyday comfort.',
    sub: 'Curated everyday apparel, designer leather bags, and premium footwear tailored for your style.',
    primaryCta: 'Explore Fashion',
    secondaryCta: 'Explore Categories',
    primaryTo: '/category/womens-fashion',
    secondaryTo: '#categories',
  },
  {
    id: 4,
    art: scene(homeLg, homeSm),
    bg: '#FDF0DA',
    headingLine1: 'Warm spaces.',
    headingLine2: 'Modern aesthetic.',
    sub: 'Transform your home with contemporary lounge armchairs, ambient lighting, and artisanal decor.',
    primaryCta: 'Discover Home',
    secondaryCta: 'Explore Categories',
    primaryTo: '/category/home-living',
    secondaryTo: '#categories',
  },
  {
    id: 5,
    art: scene(beautyLg, beautySm),
    bg: '#FDF1E0',
    headingLine1: 'Your daily glow.',
    headingLine2: 'Skin and scents.',
    sub: 'Serums, creams and fragrances from checked shops, delivered to your door.',
    primaryCta: 'Shop Beauty',
    secondaryCta: 'Explore Categories',
    primaryTo: '/category/health-beauty',
    secondaryTo: '#categories',
  },
];

const AUTO_INTERVAL = 6000;

// The picture fades in at its left edge (where the headline sits) and at its right edge (where it meets the banner).
const SCENE_MASK = 'linear-gradient(90deg, transparent 0%, #000 24%, #000 93%, transparent 100%)';

export default function HeroCarousel() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

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
    <MotionConfig reducedMotion="user">
      <section
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{ backgroundColor: slide.bg }}
        className="relative overflow-hidden select-none w-full border-b border-amber-200/50 h-[320px] sm:h-[360px] lg:h-[390px] xl:h-[400px] transition-colors duration-700"
      >
        {/* ── The picture: behind the headline, filling the banner ── */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="relative h-full max-w-[1536px] mx-auto">
            <AnimatePresence initial={false}>
              <motion.div
                key={`art-${slide.id}`}
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="absolute inset-0"
              >
                {slide.art.kind === 'scene' ? (
                  <img
                    src={slide.art.src}
                    srcSet={slide.art.srcSet}
                    sizes="(min-width: 640px) 1000px, 640px"
                    alt=""
                    draggable={false}
                    style={{ maskImage: SCENE_MASK, WebkitMaskImage: SCENE_MASK }}
                    className="absolute bottom-0 h-[62%] right-0 sm:bottom-auto sm:top-[46%] sm:-translate-y-1/2 sm:h-[106%] w-auto max-w-none sm:-right-[8%] lg:right-0 xl:right-[6%]"
                  />
                ) : (
                  <img
                    src={slide.art.src}
                    alt=""
                    draggable={false}
                    className="absolute bottom-[4%] h-[50%] sm:h-[82%] lg:h-[86%] w-auto max-w-none -right-[6%] sm:-right-[4%] lg:right-[2%] xl:right-[4%] drop-shadow-md"
                  />
                )}
              </motion.div>
            </AnimatePresence>
            {/* Phones: the headline sits above the picture. Tablets: the picture runs behind the headline. Either way the
                banner colour covers that part of the picture so the text stays readable. */}
            <div
              className="absolute inset-0 sm:hidden"
              style={{ background: `linear-gradient(180deg, ${slide.bg} 0%, ${slide.bg} 40%, ${slide.bg}00 62%)` }}
            />
            <div
              className="absolute inset-0 hidden sm:block lg:hidden"
              style={{ background: `linear-gradient(90deg, ${slide.bg} 0%, ${slide.bg} 38%, ${slide.bg}00 82%)` }}
            />
          </div>
        </div>

        {/* ── The headline and actions ── */}
        <div className="relative z-20 max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 h-full flex items-start pt-7 sm:items-center sm:pt-0">
          <div className="max-w-[300px] sm:max-w-md lg:max-w-[460px] space-y-2.5 sm:space-y-3.5">
            <AnimatePresence mode="wait">
              <motion.div
                key={`head-${slide.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="space-y-0.5 sm:space-y-1"
              >
                <h1 className="text-[28px] sm:text-4xl lg:text-[46px] font-serif font-bold text-[#1C1917] leading-[1.1] tracking-tight">
                  <span className="block">{slide.headingLine1}</span>
                  <span className="block text-brand-red italic font-normal sm:font-bold">{slide.headingLine2}</span>
                </h1>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.p
                key={`sub-${slide.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="hidden sm:block text-sm lg:text-[15px] text-gray-700 leading-relaxed max-w-md font-medium"
              >
                {slide.sub}
              </motion.p>
            </AnimatePresence>

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
                className="hidden sm:flex px-6 py-2.5 rounded-full bg-white/95 hover:bg-white text-brand-red border border-brand-red/30 hover:border-brand-red text-sm font-bold shadow-2xs hover:shadow-xs transition-all items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <span>{slide.secondaryCta}</span>
                <ChevronRight className="w-4 h-4 text-brand-red/70" />
              </button>
            </div>

            {/* Carousel dots, then previous / next (beside the dots, so they never cover the headline) */}
            <div className="flex items-center gap-2 pt-1 sm:pt-2">
              {SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => go(i)}
                  title={`Slide ${i + 1}`}
                  aria-label={`Show slide ${i + 1}`}
                  aria-current={i === current}
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
              <span className="hidden sm:flex items-center gap-1.5 ml-3">
                {([['prev', prev, ChevronLeft], ['next', next, ChevronRight]] as const).map(([key, onClick, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={onClick}
                    title={key === 'prev' ? 'Previous slide' : 'Next slide'}
                    aria-label={key === 'prev' ? 'Previous slide' : 'Next slide'}
                    className="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-stone-600 hover:text-brand-red border border-stone-300/70 hover:border-stone-400 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </span>
            </div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
