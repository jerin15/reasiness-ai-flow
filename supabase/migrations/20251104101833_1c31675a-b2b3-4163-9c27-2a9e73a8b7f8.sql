-- Add avatar_url column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Update profiles with avatar URLs based on email
UPDATE public.profiles SET avatar_url = '/avatars/reena.jpg' WHERE email = 'reena@reaadvertising.com';
UPDATE public.profiles SET avatar_url = '/avatars/anand.png' WHERE email = 'anand@reaadvertising.com';
UPDATE public.profiles SET avatar_url = '/avatars/jairaj.png' WHERE email = 'reaadvt.designs2@gmail.com';
UPDATE public.profiles SET avatar_url = '/avatars/jigeesh.png' WHERE email = 'jigeesh.rea@gmail.com';
UPDATE public.profiles SET avatar_url = '/avatars/melvin.png' WHERE email = 'melvin@reaadvertising.com';
UPDATE public.profiles SET avatar_url = '/avatars/jerin.png' WHERE email LIKE '%jerin%';