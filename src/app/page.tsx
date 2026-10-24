import Benefits from "@/components/blocks/Benefits";
import Reviews from "@/components/blocks/Reviews";
import RecentlyViewed from "@/components/blocks/RecentlyViewed";
import TopProducts from "@/components/blocks/TopProducts";
import Categories from "@/components/layout/Categories";
import HeroSlider from "@/components/layout/Slider";
import { getCategories, getSliderImages, getTopProducts } from "@/lib";

export const revalidate = 300;

export default async function Home() {
	const [topProducts, sliderImages, categories] = await Promise.all([
		getTopProducts(),
		getSliderImages(),
		getCategories(),
	]);

	return (
		<div>
			<HeroSlider images={sliderImages} />
			<TopProducts products={topProducts} />
			<Categories categories={categories} />
			<Reviews />
			<RecentlyViewed />
			<Benefits />
		</div>
	);
}
