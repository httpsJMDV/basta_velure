import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';

const SLIDES = [
  {
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1400&q=80',
    tag: 'New Season',
    heading: 'Fashion that moves\nwith you.',
    sub: "Discover the latest women's apparel — dresses, activewear, and more.",
  },
  {
    image: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1400&q=80',
    tag: 'Best Sellers',
    heading: 'Effortless style,\nevery day.',
    sub: 'Shop our most-loved pieces trusted by thousands of women.',
  },
  {
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1400&q=80',
    tag: 'Sale',
    heading: 'Up to 50% off\nselected styles.',
    sub: 'Limited time only — refresh your wardrobe for less.',
  },
];

const INTERVAL = 5000;

export default function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setCurrent((c) => (c + 1) % SLIDES.length);
    }, INTERVAL);
    return () => clearInterval(timer);
  }, []);

  function go(index: number) {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  }

  function prev() {
    setDirection(-1);
    setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length);
  }

  function next() {
    setDirection(1);
    setCurrent((c) => (c + 1) % SLIDES.length);
  }

  const slide = SLIDES[current];

  return (
    <section className="relative bg-brand-black overflow-hidden h-[420px] sm:h-[520px]">
      {/* Slides */}
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={current}
          custom={direction}
          variants={{
            enter: (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (d: number) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <img
            src={slide.image}
            alt={slide.heading}
            className="w-full h-full object-cover opacity-50"
          />
        </motion.div>
      </AnimatePresence>

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-black/70 via-brand-black/30 to-transparent" />

      {/* Text content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`text-${current}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative h-full max-w-7xl mx-auto px-4 flex flex-col justify-center gap-4"
        >
          <span className="bg-brand-red text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest w-fit">
            {slide.tag}
          </span>
          <h1 className="text-white text-4xl sm:text-5xl font-bold leading-tight max-w-lg whitespace-pre-line">
            {slide.heading}
          </h1>
          <p className="text-white/70 text-base max-w-sm">{slide.sub}</p>
          <button className="mt-2 min-h-[44px] px-8 bg-brand-red text-white font-semibold rounded-lg hover:bg-brand-red-dark transition-colors flex items-center gap-2 w-fit">
            <ShoppingBag className="w-4 h-4" /> Shop Now
          </button>
        </motion.div>
      </AnimatePresence>

      {/* Prev / Next arrows */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={next}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            className={[
              'rounded-full transition-all duration-300',
              i === current ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/70',
            ].join(' ')}
          />
        ))}
      </div>
    </section>
  );
}
