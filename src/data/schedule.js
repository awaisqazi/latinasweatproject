// src/data/schedule.js
const STUDIO = '949 W 16th Street';
const BOOK_LINK = 'https://www.zeffy.com/en-US/ticketing/lsp-soft-launch-classes';

const rawSchedule = [
  // Monday, August 18, 2025
  ['2025-8-18', '6:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-8-18', '7:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-8-18', '12:00 PM', 'Yoga Sculpt', 'Brenda'],
  ['2025-8-18', '5:30 PM', 'Yoga Flow', 'Juanita'],
  ['2025-8-18', '6:30 PM', 'Yoga Sculpt', 'Vero'],
  ['2025-8-18', '7:30 PM', 'Restorative Yoga', 'Liz'],

  // Tuesday, August 19, 2025
  ['2025-8-19', '6:15 AM', 'Mat Pilates', 'Margarita'],
  ['2025-8-19', '7:15 AM', 'Strength Train', 'Eli'],
  ['2025-8-19', '8:15 AM', 'Yoga Flow', 'Lizzel'],
  ['2025-8-19', '12:00 PM', 'Mat Pilates', 'Ashley'],

  // Wednesday, August 20, 2025
  ['2025-8-20', '6:15 AM', 'Yoga Flow', 'Yajari'],
  ['2025-8-20', '7:15 AM', 'Yoga Flow in Spanish', 'Zoraida'],
  ['2025-8-20', '8:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-8-20', '12:00 PM', 'Yoga Flow', 'Alyx'],
  ['2025-8-20', '5:30 PM', 'Yoga Flow', 'Gayatri'],
  ['2025-8-20', '6:30 PM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-8-20', '7:30 PM', 'Restorative Yoga', 'Gaby'],

  // Thursday, August 21, 2025
  ['2025-8-21', '6:15 AM', 'Yoga Flow', 'Laura'],
  ['2025-8-21', '7:15 AM', 'Strength Train', 'Jay'],
  ['2025-8-21', '8:15 AM', 'Yoga Flow', 'Grecia'],
  ['2025-8-21', '12:00 PM', 'Yoga Flow', 'Hayley'],

  // Friday, August 22, 2025
  ['2025-8-22', '6:15 AM', 'Yoga Flow', 'Christian'],
  ['2025-8-22', '7:15 AM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-8-22', '8:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-8-22', '12:00 PM', 'Yoga Sculpt', 'Margarita'],

  // Saturday, August 23, 2025
  ['2025-8-23', '8:00 AM', 'Strength Train', 'Eli'],
  ['2025-8-23', '9:00 AM', 'Yoga Sculpt', 'Ashley'],
  ['2025-8-23', '10:00 AM', 'Mat Pilates', 'Margarita'],
  ['2025-8-23', '11:00 AM', 'Dance Fitness', 'Kayla'],

  // Sunday, August 24, 2025
  ['2025-8-24', '8:00 AM', 'Strength Train', 'Jay'],
  ['2025-8-24', '9:00 AM', 'Yoga Flow', 'Alyx'],
  ['2025-8-24', '10:00 AM', 'Yoga Flow', 'Brenda'],
  ['2025-8-24', '11:00 AM', 'Dance Fitness', 'Rut'],
  ['2025-8-24', '5:00 PM', 'Yoga Flow in Spanish', 'Montserrat'],
  ['2025-8-24', '6:15 PM', 'Trauma Sensitive Yoga Bilingual', 'Lucia'],

  // Monday, August 25, 2025
  ['2025-8-25', '6:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-8-25', '7:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-8-25', '12:00 PM', 'Yoga Sculpt', 'Brenda'],
  ['2025-8-25', '5:30 PM', 'Yoga Flow', 'Juanita'],
  ['2025-8-25', '6:30 PM', 'Yoga Sculpt', 'Vero'],
  ['2025-8-25', '7:30 PM', 'Restorative Yoga', 'Liz'],

  // Tuesday, August 26, 2025
  ['2025-8-26', '6:15 AM', 'Mat Pilates', 'Margarita'],
  ['2025-8-26', '7:15 AM', 'Strength Train', 'Eli'],
  ['2025-8-26', '8:15 AM', 'Yoga Flow', 'Lizzel'],
  ['2025-8-26', '12:00 PM', 'Mat Pilates', 'Ashley'],

  // Wednesday, August 27, 2025
  ['2025-8-27', '6:15 AM', 'Yoga Flow', 'Yajari'],
  ['2025-8-27', '7:15 AM', 'Yoga Flow in Spanish', 'Zoraida'],
  ['2025-8-27', '8:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-8-27', '12:00 PM', 'Yoga Flow', 'Alyx'],
  ['2025-8-27', '5:30 PM', 'Yoga Flow', 'Gayatri'],
  ['2025-8-27', '6:30 PM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-8-27', '7:30 PM', 'Restorative Yoga', 'Gaby'],

  // Thursday, August 28, 2025
  ['2025-8-28', '6:15 AM', 'Yoga Flow', 'Laura'],
  ['2025-8-28', '7:15 AM', 'Strength Train', 'Jay'],
  ['2025-8-28', '8:15 AM', 'Yoga Flow', 'Grecia'],
  ['2025-8-28', '12:00 PM', 'Yoga Flow', 'Hayley'],

  // Friday, August 29, 2025
  ['2025-8-29', '6:15 AM', 'Yoga Flow', 'Christian'],
  ['2025-8-29', '7:15 AM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-8-29', '8:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-8-29', '12:00 PM', 'Yoga Sculpt', 'Margarita'],

  // Saturday, August 30, 2025
  ['2025-8-30', '8:00 AM', 'Strength Train', 'Eli'],
  ['2025-8-30', '9:00 AM', 'Yoga Sculpt', 'Ashley'],
  ['2025-8-30', '10:00 AM', 'Mat Pilates', 'Margarita'],
  ['2025-8-30', '11:00 AM', 'Dance Fitness', 'Kayla'],

  // Sunday, August 31, 2025
  ['2025-8-31', '8:00 AM', 'Strength Train', 'Jay'],
  ['2025-8-31', '9:00 AM', 'Yoga Flow', 'Alyx'],
  ['2025-8-31', '10:00 AM', 'Yoga Flow', 'Brenda'],
  ['2025-8-31', '11:00 AM', 'Dance Fitness', 'Rut'],
  ['2025-8-31', '5:00 PM', 'Yoga Flow in Spanish', 'Montserrat'],
  ['2025-8-31', '6:15 PM', 'Trauma Sensitive Yoga Bilingual', 'Lucia'],

  // Monday, September 1, 2025
  ['2025-9-1', '6:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-1', '7:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-1', '12:00 PM', 'Yoga Sculpt', 'Brenda'],
  ['2025-9-1', '5:30 PM', 'Yoga Flow', 'Juanita'],
  ['2025-9-1', '6:30 PM', 'Yoga Sculpt', 'Vero'],
  ['2025-9-1', '7:30 PM', 'Restorative Yoga', 'Liz'],

  // Tuesday, September 2, 2025
  ['2025-9-2', '6:15 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-2', '7:15 AM', 'Strength Train', 'Eli'],
  ['2025-9-2', '8:15 AM', 'Yoga Flow', 'Lizzel'],
  ['2025-9-2', '12:00 PM', 'Mat Pilates', 'Ashley'],

  // Wednesday, September 3, 2025
  ['2025-9-3', '6:15 AM', 'Yoga Flow', 'Yajari'],
  ['2025-9-3', '7:15 AM', 'Yoga Flow in Spanish', 'Zoraida'],
  ['2025-9-3', '8:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-3', '12:00 PM', 'Yoga Flow', 'Alyx'],
  ['2025-9-3', '5:30 PM', 'Yoga Flow', 'Gayatri'],
  ['2025-9-3', '6:30 PM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-3', '7:30 PM', 'Restorative Yoga', 'Gaby'],

  // Thursday, September 4, 2025
  ['2025-9-4', '6:15 AM', 'Yoga Flow', 'Laura'],
  ['2025-9-4', '7:15 AM', 'Strength Train', 'Jay'],
  ['2025-9-4', '8:15 AM', 'Yoga Flow', 'Grecia'],
  ['2025-9-4', '12:00 PM', 'Yoga Flow', 'Hayley'],

  // Friday, September 5, 2025
  ['2025-9-5', '6:15 AM', 'Yoga Flow', 'Christian'],
  ['2025-9-5', '7:15 AM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-5', '8:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-5', '12:00 PM', 'Yoga Sculpt', 'Margarita'],

  // Saturday, September 6, 2025
  ['2025-9-6', '8:00 AM', 'Strength Train', 'Eli'],
  ['2025-9-6', '9:00 AM', 'Yoga Sculpt', 'Ashley'],
  ['2025-9-6', '10:00 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-6', '11:00 AM', 'Dance Fitness', 'Kayla'],

  // Sunday, September 7, 2025
  ['2025-9-7', '8:00 AM', 'Strength Train', 'Jay'],
  ['2025-9-7', '9:00 AM', 'Yoga Flow', 'Alyx'],
  ['2025-9-7', '10:00 AM', 'Yoga Flow', 'Brenda'],
  ['2025-9-7', '11:00 AM', 'Dance Fitness', 'Rut'],
  ['2025-9-7', '5:00 PM', 'Yoga Flow in Spanish', 'Montserrat'],
  ['2025-9-7', '6:15 PM', 'Trauma Sensitive Yoga Bilingual', 'Lucia'],

  // Monday, September 8, 2025
  ['2025-9-8', '6:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-8', '7:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-8', '12:00 PM', 'Yoga Sculpt', 'Brenda'],
  ['2025-9-8', '5:30 PM', 'Yoga Flow', 'Juanita'],
  ['2025-9-8', '6:30 PM', 'Yoga Sculpt', 'Vero'],
  ['2025-9-8', '7:30 PM', 'Restorative Yoga', 'Liz'],

  // Tuesday, September 9, 2025
  ['2025-9-9', '6:15 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-9', '7:15 AM', 'Strength Train', 'Eli'],
  ['2025-9-9', '8:15 AM', 'Yoga Flow', 'Lizzel'],
  ['2025-9-9', '12:00 PM', 'Mat Pilates', 'Ashley'],

  // Wednesday, September 10, 2025
  ['2025-9-10', '6:15 AM', 'Yoga Flow', 'Yajari'],
  ['2025-9-10', '7:15 AM', 'Yoga Flow in Spanish', 'Zoraida'],
  ['2025-9-10', '8:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-10', '12:00 PM', 'Yoga Flow', 'Alyx'],
  ['2025-9-10', '5:30 PM', 'Yoga Flow', 'Gayatri'],
  ['2025-9-10', '6:30 PM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-10', '7:30 PM', 'Restorative Yoga', 'Gaby'],

  // Thursday, September 11, 2025
  ['2025-9-11', '6:15 AM', 'Yoga Flow', 'Laura'],
  ['2025-9-11', '7:15 AM', 'Strength Train', 'Jay'],
  ['2025-9-11', '8:15 AM', 'Yoga Flow', 'Grecia'],
  ['2025-9-11', '12:00 PM', 'Yoga Flow', 'Hayley'],

  // Friday, September 12, 2025
  ['2025-9-12', '6:15 AM', 'Yoga Flow', 'Christian'],
  ['2025-9-12', '7:15 AM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-12', '8:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-12', '12:00 PM', 'Yoga Sculpt', 'Margarita'],

  // Saturday, September 13, 2025
  ['2025-9-13', '8:00 AM', 'Strength Train', 'Eli'],
  ['2025-9-13', '9:00 AM', 'Yoga Sculpt', 'Ashley'],
  ['2025-9-13', '10:00 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-13', '11:00 AM', 'Dance Fitness', 'Kayla'],

  // Sunday, September 14, 2025
  ['2025-9-14', '8:00 AM', 'Strength Train', 'Jay'],
  ['2025-9-14', '9:00 AM', 'Yoga Flow', 'Alyx'],
  ['2025-9-14', '10:00 AM', 'Yoga Flow', 'Brenda'],
  ['2025-9-14', '11:00 AM', 'Dance Fitness', 'Rut'],
  ['2025-9-14', '5:00 PM', 'Yoga Flow in Spanish', 'Montserrat'],
  ['2025-9-14', '6:15 PM', 'Trauma Sensitive Yoga Bilingual', 'Lucia'],

  // Monday, September 15, 2025
  ['2025-9-15', '6:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-15', '7:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-15', '12:00 PM', 'Yoga Sculpt', 'Brenda'],
  ['2025-9-15', '5:30 PM', 'Yoga Flow', 'Juanita'],
  ['2025-9-15', '6:30 PM', 'Yoga Sculpt', 'Vero'],
  ['2025-9-15', '7:30 PM', 'Restorative Yoga', 'Liz'],

  // Tuesday, September 16, 2025
  ['2025-9-16', '6:15 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-16', '7:15 AM', 'Strength Train', 'Eli'],
  ['2025-9-16', '12:00 PM', 'Mat Pilates', 'Ashley'],

  // Wednesday, September 17, 2025
  ['2025-9-17', '6:15 AM', 'Yoga Flow', 'Yajari'],
  ['2025-9-17', '7:15 AM', 'Yoga Flow in Spanish', 'Zoraida'],
  ['2025-9-17', '8:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-17', '12:00 PM', 'Yoga Flow', 'Alyx'],
  ['2025-9-17', '5:30 PM', 'Yoga Flow', 'Gayatri'],
  ['2025-9-17', '6:30 PM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-17', '7:30 PM', 'Restorative Yoga', 'Gaby'],
  ['2025-9-17', '8:15 AM', 'Yoga Flow', 'Lizzel'],

  // Thursday, September 18, 2025
  ['2025-9-18', '6:15 AM', 'Yoga Flow', 'Laura'],
  ['2025-9-18', '7:15 AM', 'Strength Train', 'Jay'],
  ['2025-9-18', '8:15 AM', 'Yoga Flow', 'Grecia'],
  ['2025-9-18', '12:00 PM', 'Yoga Flow', 'Hayley'],

  // Friday, September 19, 2025
  ['2025-9-19', '6:15 AM', 'Yoga Flow', 'Christian'],
  ['2025-9-19', '7:15 AM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-19', '8:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-19', '12:00 PM', 'Yoga Sculpt', 'Margarita'],

  // Saturday, September 20, 2025
  ['2025-9-20', '8:00 AM', 'Strength Train', 'Eli'],
  ['2025-9-20', '9:00 AM', 'Yoga Sculpt', 'Ashley'],
  ['2025-9-20', '10:00 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-20', '11:00 AM', 'Dance Fitness', 'Kayla'],

  // Sunday, September 21, 2025
  ['2025-9-21', '8:00 AM', 'Strength Train', 'Jay'],
  ['2025-9-21', '9:00 AM', 'Yoga Flow', 'Alyx'],
  ['2025-9-21', '10:00 AM', 'Yoga Flow', 'Brenda'],
  ['2025-9-21', '11:00 AM', 'Dance Fitness', 'Rut'],
  ['2025-9-21', '5:00 PM', 'Yoga Flow in Spanish', 'Montserrat'],
  ['2025-9-21', '6:15 PM', 'Trauma Sensitive Yoga Bilingual', 'Lucia'],

  // Monday, September 22, 2025
  ['2025-9-22', '6:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-22', '7:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-22', '12:00 PM', 'Yoga Sculpt', 'Brenda'],
  ['2025-9-22', '5:30 PM', 'Yoga Flow', 'Juanita'],
  ['2025-9-22', '6:30 PM', 'Yoga Sculpt', 'Vero'],
  ['2025-9-22', '7:30 PM', 'Restorative Yoga', 'Liz'],

  // Tuesday, September 23, 2025
  ['2025-9-23', '6:15 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-23', '7:15 AM', 'Strength Train', 'Eli'],
  ['2025-9-23', '12:00 PM', 'Mat Pilates', 'Ashley'],

  // Wednesday, September 24, 2025
  ['2025-9-24', '6:15 AM', 'Yoga Flow', 'Yajari'],
  ['2025-9-24', '7:15 AM', 'Yoga Flow in Spanish', 'Zoraida'],
  ['2025-9-24', '8:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-24', '12:00 PM', 'Yoga Flow', 'Alyx'],
  ['2025-9-24', '5:30 PM', 'Yoga Flow', 'Gayatri'],
  ['2025-9-24', '6:30 PM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-24', '7:30 PM', 'Restorative Yoga', 'Gaby'],
  ['2025-9-24', '8:15 AM', 'Yoga Flow', 'Lizzel'],

  // Thursday, September 25, 2025
  ['2025-9-25', '6:15 AM', 'Yoga Flow', 'Laura'],
  ['2025-9-25', '7:15 AM', 'Strength Train', 'Jay'],
  ['2025-9-25', '8:15 AM', 'Yoga Flow', 'Grecia'],
  ['2025-9-25', '12:00 PM', 'Yoga Flow', 'Hayley'],

  // Friday, September 26, 2025
  ['2025-9-26', '6:15 AM', 'Yoga Flow', 'Christian'],
  ['2025-9-26', '7:15 AM', 'Yoga Sculpt', 'Amayrani'],
  ['2025-9-26', '8:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-26', '12:00 PM', 'Yoga Sculpt', 'Margarita'],

  // Saturday, September 27, 2025
  ['2025-9-27', '8:00 AM', 'Strength Train', 'Eli'],
  ['2025-9-27', '9:00 AM', 'Yoga Sculpt', 'Ashley'],
  ['2025-9-27', '10:00 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-27', '11:00 AM', 'Dance Fitness', 'Kayla'],

  // Sunday, September 28, 2025
  ['2025-9-28', '8:00 AM', 'Strength Train', 'Jay'],
  ['2025-9-28', '9:00 AM', 'Yoga Flow', 'Alyx'],
  ['2025-9-28', '10:00 AM', 'Yoga Flow', 'Brenda'],
  ['2025-9-28', '11:00 AM', 'Dance Fitness', 'Rut'],
  ['2025-9-28', '5:00 PM', 'Yoga Flow in Spanish', 'Montserrat'],
  ['2025-9-28', '6:15 PM', 'Trauma Sensitive Yoga Bilingual', 'Lucia'],

  // Monday, September 29, 2025
  ['2025-9-29', '6:15 AM', 'Yoga Sculpt', 'Rachel'],
  ['2025-9-29', '7:15 AM', 'Yoga Flow', 'Gerrald'],
  ['2025-9-29', '12:00 PM', 'Yoga Sculpt', 'Brenda'],
  ['2025-9-29', '5:30 PM', 'Yoga Flow', 'Juanita'],
  ['2025-9-29', '6:30 PM', 'Yoga Sculpt', 'Vero'],
  ['2025-9-29', '7:30 PM', 'Restorative Yoga', 'Liz'],

  // Tuesday, September 30, 2025
  ['2025-9-30', '6:15 AM', 'Mat Pilates', 'Margarita'],
  ['2025-9-30', '7:15 AM', 'Strength Train', 'Eli'],
  ['2025-9-30', '12:00 PM', 'Mat Pilates', 'Ashley'],
];

export const classSchedule = rawSchedule.map(([date, time, name, instructor]) => ({
  date,
  time,
  name,
  instructor,
  studio: STUDIO,
  bookLink: BOOK_LINK,
}));