// models/Counter.js
import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "employee_seq"
  seq: { type: Number, default: 0 },
}, { timestamps: true });

const Counter = mongoose.model('Counter', CounterSchema);
export default Counter;
