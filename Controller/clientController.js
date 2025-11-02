import Client from "../Models/Client.js";


export const getClients = async (req, res) => {
  try {
    const clients = await Client.find().populate("createdBy", "fullName email");
    res.status(200).json({
      success: true,
      message: "Clients fetched successfully",
      data: clients
    });
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};


export const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate("createdBy", "fullName email");
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    res.status(200).json({
      success: true,
      message: "Client fetched successfully",
      data: client
    });
  } catch (error) {
    console.error("Error fetching client by ID:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};


export const updateClient = async (req, res) => {
  try {
    const { name, email, phone, businessName, meta } = req.body;

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, businessName, meta },
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    res.status(200).json({
      success: true,
      message: "Client updated successfully",
      data: client
    });
  } catch (error) {
    console.error("Error updating client:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};


export const deleteClient = async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    res.status(200).json({
      success: true,
      message: "Client deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};
