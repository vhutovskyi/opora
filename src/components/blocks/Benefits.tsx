'use client';

import { BenefitBoxIcon, BenefitColorsIcon, BenefitShieldIcon } from "../ui/Icons";

const benefitsData = [
  {
    id: 1,
    title: "Доставка по всій Україні",
    icon: <BenefitBoxIcon className="w-8 h-8 md:w-10 md:h-10 stroke-current" />,
  },
  {
    id: 2,
    title: "Гарантія якості",
    icon: <BenefitShieldIcon className="w-8 h-8 md:w-10 md:h-10 stroke-current" />,
  },
  {
    id: 3,
    title: "Колір на будь-який смак",
    icon: <BenefitColorsIcon className="w-8 h-8 md:w-10 md:h-10 stroke-current" />,
  },
];

export default function Benefits() {
  return (
    <section className="pt-6 pb-12 md:pb-16 bg-opora-menu w-full border-b border-opora-brown/10">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        
        {/* Container: a column on mobile, a row on desktop */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-center md:justify-around gap-8 md:gap-4">
          
          {benefitsData.map((item) => (
            <div 
              key={item.id} 
              className="flex items-center gap-4 md:gap-5 text-opora-brown hover:opacity-80 transition-opacity"
            >
              {/* The icon block */}
              <div className="shrink-0 flex items-center justify-center text-opora-brown">
                {item.icon}
              </div>
              
              {/* The text */}
              <span className="text-lg md:text-xl font-medium tracking-wide">
                {item.title}
              </span>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}