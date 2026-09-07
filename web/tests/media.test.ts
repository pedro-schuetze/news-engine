import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPool, autoFillEmptySlides, applySelection } from "../src/lib/media/persist";
import type { Story, MediaCandidate } from "../src/lib/types";
const candidate = (id: string, slide: number, score = 80) => ({id, generated_for_slide:slide, local_path:`test/${id}.jpg`, score, origin:"upload", source:"ai", text_placement:"BOTTOM", text_align:"center"}) as MediaCandidate;
test("three candidates per slide; regeneration adds choices and preserves selected images", () => {
 const story = {story_id:"fixture",draft:{slides:[1,2,3,4,5].map(slide_number=>({slide_number}))},media_pool:[],slide_media:[]} as unknown as Story;
 const first = [1,2,3,4,5].flatMap(n=>[0,1,2].map(v=>candidate(`${n}-${v}`,n,80-v)));
 applyPool(story, first); assert.equal(story.media_pool?.length,15);
 assert.deepEqual(autoFillEmptySlides(story),[1,2,3,4,5]);
 for(const image of story.slide_media ?? []) assert.ok(image.local_path?.includes(`${image.slide_number}-`));
 const chosen = JSON.stringify(story.slide_media);
 applyPool(story,[1,2,3,4,5].flatMap(n=>[0,1,2].map(v=>candidate(`new-${n}-${v}`,n,99-v))));
 assert.equal(story.media_pool?.length,30); assert.deepEqual(autoFillEmptySlides(story),[]); assert.equal(JSON.stringify(story.slide_media),chosen);
 applyPool(story,first); assert.equal(story.media_pool?.length,30);
 applySelection(story,1,first[9]);assert.equal(story.slide_media?.find(m=>m.slide_number===1)?.local_path,'test/4-0.jpg');
});
