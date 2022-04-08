// credit: https://vanillajstoolkit.com/helpers/isequal/

/**
 * More accurately check the type of a JavaScript object
 * @param  {Object} obj The object
 * @return {String}     The object type
 */
const getType = (obj) => Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();

/**
 * Compares two arrays and returns true if they are equal
 *
 * @return {boolean}
 */
export const areArraysEqual = (obj1, obj2) => {
  // Check length
  if (obj1.length !== obj2.length) return false;

  // Check each item in the array
  for (let i = 0; i < obj1.length; i += 1) {
    if (!isEqual(obj1[i], obj2[i])) return false;
  }

  // If no errors, return true
  return true;
};

/**
 * Compares two Objects, returning true if they are equal
 *
 * @return {boolean}
 */
export const areObjectsEqual = (obj1, obj2) => {
  // objects cannot be equal if they have different keys
  if (Object.keys(obj1).length !== Object.keys(obj2).length) {
    return false;
  }

  // Check each item in the object, if any differ in value, return false
  /* eslint-disable-next-line no-restricted-syntax */
  for (const key in obj1) {
    if (Object.prototype.hasOwnProperty.call(obj1, key)) {
      if (!isEqual(obj1[key], obj2[key])) return false;
    }
  }

  // If everything matches, return true
  return true;
};

/**
 * Compares two functions, returning true if they are equal
 *
 * @return {boolean}
 */
export const areFunctionsEqual = (obj1, obj2) => obj1.toString() === obj2.toString();

/**
 * Compares if the objects are exactly equal
 *
 * @return {boolean}
 */
export const arePrimativesEqual = (obj1, obj2) => obj1 === obj2;

/*!
 * Check if two objects or arrays are equal
 * (c) 2021 Chris Ferdinandi, MIT License, https://gomakethings.com
 * @param  {*}       obj1 The first item
 * @param  {*}       obj2 The second item
 * @return {Boolean}       Returns true if they're equal in value
 */
export const isEqual = (obj1, obj2) => {
  // Get the object type
  const type = getType(obj1);

  // If the two items are not the same type, return false
  if (type !== getType(obj2)) return false;

  // Compare based on type
  if (type === 'array') return areArraysEqual(obj1, obj2);
  if (type === 'object') return areObjectsEqual(obj1, obj2);
  if (type === 'function') return areFunctionsEqual(obj1, obj2);
  return arePrimativesEqual(obj1, obj2);
};
