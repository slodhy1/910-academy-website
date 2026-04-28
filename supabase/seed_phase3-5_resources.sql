-- Phase 3.5: Seed external resource cards for products that ship with software / plugin lists.
-- Idempotent on (product_id, title) via the partial unique guard below.

-- Guard against duplicates if re-run. The table has no natural unique key, so we use a
-- conditional insert: skip rows whose (product_id, title) pair already exists.

-- Lucid Horizon Workshop
insert into public.product_resources (product_id, resource_type, title, description, url, display_order)
select p.id, vid.resource_type, vid.title, vid.description, vid.url, vid.display_order
from public.products p,
  (values
    ('link'::text, 'FCPX Stabilizer 2.0', 'Pixel Films Studios stabilizer plugin used throughout the workshop', 'https://store.pixelfilmstudios.com/product/fcpx-stabilizer/', 1),
    ('link', 'Motion VFX DesignStudio', 'Lock On / Rotation Zoom plugin pack', 'https://www.motionvfx.com/subscriptions/designstudio', 2),
    ('link', 'Smooth Transitions by Ryan Nangle', 'Final Cut Pro X transition pack (zoom ins, pans)', 'https://www.finalcutplugs.com/p/gyh6/', 3)
  ) as vid(resource_type, title, description, url, display_order)
where p.slug = 'lucid-horizon-workshop'
  and not exists (
    select 1 from public.product_resources pr
    where pr.product_id = p.id and pr.title = vid.title
  );

-- 3D Made Easy
insert into public.product_resources (product_id, resource_type, title, description, url, display_order)
select p.id, vid.resource_type, vid.title, vid.description, vid.url, vid.display_order
from public.products p,
  (values
    ('link'::text, 'DaVinci Resolve Studio', 'Required for the white caption effect ($295 one-time)', 'https://www.blackmagicdesign.com/products/davinciresolve', 1),
    ('link', 'Snap Captions Plugin (free)', 'Free DaVinci plugin by Orson Lord / Dan Knowlton — find on YouTube', 'https://www.youtube.com/@DanKnowltonn', 2),
    ('link', 'Motion VFX', 'Source for the 3D text plugins used in the workshop', 'https://www.motionvfx.com/', 3),
    ('link', 'Lulu Clean Bold (font)', 'The 910 caption font — install before generating captions', 'https://www.dafont.com/lulu-clean.font', 4)
  ) as vid(resource_type, title, description, url, display_order)
where p.slug = '3d-made-easy'
  and not exists (
    select 1 from public.product_resources pr
    where pr.product_id = p.id and pr.title = vid.title
  );
